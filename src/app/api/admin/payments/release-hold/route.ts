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

type ReleaseHoldPayload = {
  paymentCaseId?: string;
  reason?: string;
  correlationId?: string;
};

type PaymentCaseRow = {
  id: string;
  user_id: string;
  case_type: string;
  status: string;
  hold_txn_id: string | null;
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

    const body = (await request.json()) as ReleaseHoldPayload;
    const paymentCaseId = (body.paymentCaseId || '').trim();
    const reason = normalizeReason(body.reason);
    const correlationId = toSafeCorrelationId(body.correlationId) || `release:${Date.now()}`;

    if (!paymentCaseId || !reason) {
      return NextResponse.json(
        { error: 'paymentCaseId and reason (>= 8 chars) are required' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: paymentCaseRow, error: paymentCaseError } = await supabaseAdmin
      .from('payment_cases')
      .select('id, user_id, case_type, status, hold_txn_id')
      .eq('id', paymentCaseId)
      .maybeSingle();

    if (paymentCaseError) {
      throw paymentCaseError;
    }

    const paymentCase = (paymentCaseRow as PaymentCaseRow | null) || null;
    if (!paymentCase) {
      return NextResponse.json({ error: 'Payment case not found' }, { status: 404 });
    }

    if (paymentCase.case_type !== 'chargeback') {
      return NextResponse.json({ error: 'Only chargeback cases can be released' }, { status: 409 });
    }

    if (paymentCase.status === 'resolved' || paymentCase.status === 'canceled') {
      return NextResponse.json({ error: 'This payment case is already closed' }, { status: 409 });
    }

    if (!paymentCase.hold_txn_id) {
      return NextResponse.json({ error: 'No hold transaction attached to this case' }, { status: 409 });
    }

    const { data: holdTxn, error: holdTxnError } = await supabaseAdmin
      .from('coin_transactions')
      .select('id, amount')
      .eq('id', paymentCase.hold_txn_id)
      .maybeSingle();

    if (holdTxnError) {
      throw holdTxnError;
    }

    if (!holdTxn) {
      return NextResponse.json({ error: 'Hold transaction not found' }, { status: 404 });
    }

    const holdAmount = Math.abs(Number(holdTxn.amount || 0));
    if (holdAmount <= 0) {
      return NextResponse.json({ error: 'Invalid hold amount' }, { status: 409 });
    }

    const { data: applyRows, error: applyError } = await supabaseAdmin.rpc('apply_coin_transaction', {
      p_user_id: paymentCase.user_id,
      p_amount: holdAmount,
      p_txn_type: 'chargeback_release',
      p_description: `Chargeback hold release (${holdAmount} coins)`,
      p_chapter_id: null,
      p_stripe_session_id: null,
      p_reference_type: 'payment_case',
      p_reference_id: paymentCase.id,
      p_policy_version: MONETIZATION_POLICY_VERSION,
      p_reversal_of_txn_id: paymentCase.hold_txn_id,
      p_reason: reason,
      p_actor_user_id: actor.id,
      p_correlation_id: correlationId,
      p_allow_negative: true,
    });

    if (applyError) {
      throw applyError;
    }

    const applyResult = Array.isArray(applyRows) && applyRows.length > 0
      ? (applyRows[0] as ApplyCoinTransactionResult)
      : null;

    if (!applyResult || !applyResult.success) {
      return NextResponse.json(
        {
          error: 'Unable to release hold transaction',
          code: applyResult?.message || 'CHARGEBACK_RELEASE_FAILED',
        },
        { status: 409 }
      );
    }

    await supabaseAdmin
      .from('payment_cases')
      .update({
        status: 'resolved',
        resolution_txn_id: applyResult.txn_id,
        resolved_by: actor.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', paymentCase.id);

    const { data: openChargebackRows, error: openChargebackError } = await supabaseAdmin
      .from('payment_cases')
      .select('id')
      .eq('user_id', paymentCase.user_id)
      .eq('case_type', 'chargeback')
      .in('status', ['open', 'approved'])
      .neq('id', paymentCase.id)
      .limit(1);

    if (openChargebackError) {
      throw openChargebackError;
    }

    const hasOtherOpenChargeback = Array.isArray(openChargebackRows) && openChargebackRows.length > 0;
    if (!hasOtherOpenChargeback) {
      const { data: financeRow } = await supabaseAdmin
        .from('user_finance_statuses')
        .select('finance_status, risk_score')
        .eq('user_id', paymentCase.user_id)
        .maybeSingle();

      if (financeRow?.finance_status !== 'banned_finance') {
        await supabaseAdmin
          .from('user_finance_statuses')
          .upsert(
            {
              user_id: paymentCase.user_id,
              finance_status: 'normal',
              enforcement_level: 0,
              risk_score: Math.max(0, Number(financeRow?.risk_score || 0) - 40),
              restriction_until: null,
              last_signal_at: new Date().toISOString(),
              notes: 'Released chargeback hold via admin action',
            },
            { onConflict: 'user_id' }
          );
      }
    }

    return NextResponse.json({
      success: true,
      paymentCaseId: paymentCase.id,
      releaseTransactionId: applyResult.txn_id,
      newBalance: applyResult.new_balance,
      financeStatus: hasOtherOpenChargeback ? 'restricted_finance' : 'normal',
      policyVersion: MONETIZATION_POLICY_VERSION,
    });
  } catch (error) {
    console.error('release-hold failed:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
