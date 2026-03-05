import { NextRequest, NextResponse } from 'next/server';
import { MONETIZATION_POLICY_VERSION } from '@/lib/monetization-policy';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  getAuthenticatedUser,
  isFinanceAdmin,
  normalizeReason,
  toSafeCorrelationId,
} from '../_lib';

type ApplyCoinTransactionResult = {
  success: boolean;
  message: string;
  txn_id: string | null;
  new_balance: number;
};

type RefundPayload = {
  userId?: string;
  sourceTransactionId?: string;
  reason?: string;
  correlationId?: string;
};

export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthenticatedUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isFinanceAdmin(actor.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as RefundPayload;
    const targetUserId = (body.userId || '').trim();
    const sourceTransactionId = (body.sourceTransactionId || '').trim();
    const reason = normalizeReason(body.reason);
    const correlationId = toSafeCorrelationId(body.correlationId) || `refund:${Date.now()}`;

    if (!targetUserId || !sourceTransactionId || !reason) {
      return NextResponse.json(
        { error: 'userId, sourceTransactionId, and reason (>= 8 chars) are required' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: sourceTxn, error: sourceTxnError } = await supabaseAdmin
      .from('coin_transactions')
      .select('id, user_id, amount, txn_type, policy_version')
      .eq('id', sourceTransactionId)
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (sourceTxnError) {
      throw sourceTxnError;
    }

    if (!sourceTxn) {
      return NextResponse.json({ error: 'Source transaction not found' }, { status: 404 });
    }

    if (sourceTxn.txn_type !== 'stripe_topup' || Number(sourceTxn.amount) <= 0) {
      return NextResponse.json(
        { error: 'Only positive stripe_topup transactions can be refunded' },
        { status: 409 }
      );
    }

    const { data: reversalTxn } = await supabaseAdmin
      .from('coin_transactions')
      .select('id')
      .eq('reversal_of_txn_id', sourceTransactionId)
      .maybeSingle();

    if (reversalTxn?.id) {
      return NextResponse.json({ error: 'This transaction is already reversed' }, { status: 409 });
    }

    const refundAmount = Number(sourceTxn.amount);

    const { data: wallet } = await supabaseAdmin
      .from('wallets')
      .select('coin_balance')
      .eq('user_id', targetUserId)
      .maybeSingle();

    const currentBalance = Number(wallet?.coin_balance || 0);
    if (currentBalance < refundAmount) {
      return NextResponse.json(
        {
          error: 'Refund denied: coins from this top-up are already spent',
          code: 'REFUND_COINS_ALREADY_SPENT',
          currentBalance,
          requiredBalance: refundAmount,
        },
        { status: 409 }
      );
    }

    const { data: paymentCase, error: paymentCaseError } = await supabaseAdmin
      .from('payment_cases')
      .insert({
        case_type: 'refund',
        status: 'approved',
        user_id: targetUserId,
        amount: refundAmount,
        currency: 'THB',
        reason,
        source_txn_id: sourceTransactionId,
        opened_by: actor.id,
        metadata: {
          policy_version: sourceTxn.policy_version || MONETIZATION_POLICY_VERSION,
          correlation_id: correlationId,
        },
      })
      .select('id')
      .single();

    if (paymentCaseError || !paymentCase) {
      throw paymentCaseError || new Error('Failed to create payment case');
    }

    const { data: applyRows, error: applyError } = await supabaseAdmin.rpc('apply_coin_transaction', {
      p_user_id: targetUserId,
      p_amount: -refundAmount,
      p_txn_type: 'refund',
      p_description: `Refund for stripe_topup txn ${sourceTransactionId}`,
      p_chapter_id: null,
      p_stripe_session_id: null,
      p_reference_type: 'payment_case',
      p_reference_id: paymentCase.id,
      p_policy_version: sourceTxn.policy_version || MONETIZATION_POLICY_VERSION,
      p_reversal_of_txn_id: sourceTransactionId,
      p_reason: reason,
      p_actor_user_id: actor.id,
      p_correlation_id: correlationId,
      p_allow_negative: false,
    });

    if (applyError) {
      throw applyError;
    }

    const applyResult = Array.isArray(applyRows) && applyRows.length > 0
      ? (applyRows[0] as ApplyCoinTransactionResult)
      : null;

    if (!applyResult || !applyResult.success) {
      await supabaseAdmin
        .from('payment_cases')
        .update({
          status: 'rejected',
          resolved_by: actor.id,
          resolved_at: new Date().toISOString(),
          metadata: {
            correlation_id: correlationId,
            apply_message: applyResult?.message || 'unknown',
          },
        })
        .eq('id', paymentCase.id);

      return NextResponse.json(
        {
          error: 'Unable to apply refund transaction',
          code: applyResult?.message || 'REFUND_APPLY_FAILED',
        },
        { status: 409 }
      );
    }

    await supabaseAdmin
      .from('payment_cases')
      .update({
        status: 'resolved',
        resolved_by: actor.id,
        resolved_at: new Date().toISOString(),
        resolution_txn_id: applyResult.txn_id,
      })
      .eq('id', paymentCase.id);

    return NextResponse.json({
      success: true,
      paymentCaseId: paymentCase.id,
      reversalTransactionId: applyResult.txn_id,
      newBalance: applyResult.new_balance,
      policyVersion: sourceTxn.policy_version || MONETIZATION_POLICY_VERSION,
    });
  } catch (error) {
    console.error('approve-refund failed:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
