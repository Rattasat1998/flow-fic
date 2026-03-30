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

type ApplyCreatorChargebackResult = {
  success: boolean;
  message: string;
  total_debited_satang: number;
  affected_writers: number;
};

type ChargebackHoldPayload = {
  userId?: string;
  amount?: number;
  reason?: string;
  externalReference?: string;
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

    const body = (await request.json()) as ChargebackHoldPayload;
    const targetUserId = (body.userId || '').trim();
    const reason = normalizeReason(body.reason);
    const amount = Number(body.amount || 0);
    const externalReference = typeof body.externalReference === 'string' ? body.externalReference.trim() : null;
    const correlationId = toSafeCorrelationId(body.correlationId) || `chargeback:${Date.now()}`;

    if (!targetUserId || !reason || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'userId, amount (> 0), and reason (>= 8 chars) are required' },
        { status: 400 }
      );
    }

    const holdAmount = Math.round(amount);
    const supabaseAdmin = getSupabaseAdmin();

    const { data: paymentCase, error: caseError } = await supabaseAdmin
      .from('payment_cases')
      .insert({
        case_type: 'chargeback',
        status: 'open',
        user_id: targetUserId,
        amount: holdAmount,
        currency: 'THB',
        reason,
        external_reference: externalReference,
        opened_by: actor.id,
        metadata: {
          policy_version: MONETIZATION_POLICY_VERSION,
          correlation_id: correlationId,
        },
      })
      .select('id')
      .single();

    if (caseError || !paymentCase) {
      throw caseError || new Error('Failed to create payment case');
    }

    const { data: applyRows, error: applyError } = await supabaseAdmin.rpc('apply_coin_transaction', {
      p_user_id: targetUserId,
      p_amount: -holdAmount,
      p_txn_type: 'chargeback_hold',
      p_description: `Chargeback hold (${holdAmount} coins)`,
      p_chapter_id: null,
      p_stripe_session_id: null,
      p_reference_type: 'payment_case',
      p_reference_id: paymentCase.id,
      p_policy_version: MONETIZATION_POLICY_VERSION,
      p_reversal_of_txn_id: null,
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
          error: 'Unable to apply chargeback hold',
          code: applyResult?.message || 'CHARGEBACK_HOLD_FAILED',
        },
        { status: 409 }
      );
    }

    await supabaseAdmin.rpc('record_finance_risk_signal', {
      p_user_id: targetUserId,
      p_signal_type: 'chargeback_opened',
      p_score_delta: 120,
      p_signal_window_minutes: 60,
      p_metadata: {
        payment_case_id: paymentCase.id,
        amount: holdAmount,
        external_reference: externalReference,
      },
    });

    let creatorRevenueWarning: string | null = null;
    const { data: creatorRows, error: creatorError } = await supabaseAdmin.rpc(
      'apply_creator_chargeback_debit',
      {
        p_reader_id: targetUserId,
        p_coins: holdAmount,
        p_payment_case_id: paymentCase.id,
      }
    );

    const creatorResult = Array.isArray(creatorRows) && creatorRows.length > 0
      ? (creatorRows[0] as ApplyCreatorChargebackResult)
      : null;

    if (creatorError) {
      creatorRevenueWarning = 'creator_chargeback_rpc_error';
      console.error('apply_creator_chargeback_debit failed:', creatorError);
    } else if (!creatorResult?.success) {
      creatorRevenueWarning = creatorResult?.message || 'creator_chargeback_apply_failed';
      console.warn('apply_creator_chargeback_debit returned failure:', creatorResult);
    }

    await supabaseAdmin
      .from('payment_cases')
      .update({
        status: 'approved',
        hold_txn_id: applyResult.txn_id,
        metadata: {
          policy_version: MONETIZATION_POLICY_VERSION,
          correlation_id: correlationId,
          creator_revenue_warning: creatorRevenueWarning,
          creator_debited_satang: creatorResult?.total_debited_satang || 0,
          creator_affected_writers: creatorResult?.affected_writers || 0,
        },
      })
      .eq('id', paymentCase.id);

    return NextResponse.json({
      success: true,
      paymentCaseId: paymentCase.id,
      holdTransactionId: applyResult.txn_id,
      newBalance: applyResult.new_balance,
      financeStatus: 'restricted_finance',
      policyVersion: MONETIZATION_POLICY_VERSION,
      creatorRevenue: {
        warning: creatorRevenueWarning,
        totalDebitedSatang: creatorResult?.total_debited_satang || 0,
        affectedWriters: creatorResult?.affected_writers || 0,
      },
    });
  } catch (error) {
    console.error('apply-chargeback-hold failed:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
