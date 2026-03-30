import { NextRequest, NextResponse } from 'next/server';
import { MONETIZATION_POLICY_VERSION } from '@/lib/monetization-policy';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  getAuthenticatedUser,
  isFinanceAdmin,
  normalizeReason,
  toSafeCorrelationId,
} from '../_lib';

const MAX_TOPUP_COINS = 1_000_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TopupPayload = {
  userId?: string;
  amount?: number;
  reason?: string;
  correlationId?: string;
};

type ApplyCoinTransactionResult = {
  success: boolean;
  message: string;
  txn_id: string | null;
  new_balance: number;
};

type SupabaseRpcError = {
  code?: string;
  message?: string;
  details?: string;
};

function normalizeUuid(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) return null;
  return normalized;
}

function buildCorrelationId(userId: string, amount: number) {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  return `topup:${userId}:${amount}:${suffix}`.slice(0, 120);
}

function parseSupabaseRpcError(error: unknown): SupabaseRpcError | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const candidate = error as SupabaseRpcError;
  if (
    typeof candidate.code === 'string' ||
    typeof candidate.message === 'string' ||
    typeof candidate.details === 'string'
  ) {
    return candidate;
  }

  return null;
}

function isConflictRpcError(error: SupabaseRpcError | null) {
  if (!error) return false;

  if (error.code === '23505') return true; // unique_violation (idempotency collision)
  if (error.code === 'P0001') return true; // RAISE EXCEPTION from business rule

  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  return message.includes('duplicate') || message.includes('already exists');
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthenticatedUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isFinanceAdmin(actor.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as TopupPayload;
    const userId = normalizeUuid(body.userId);
    const amount = Number(body.amount ?? 0);
    const reason = normalizeReason(body.reason);
    const providedCorrelationId = toSafeCorrelationId(body.correlationId);

    if (!userId) {
      return NextResponse.json({ error: 'userId must be a valid UUID' }, { status: 400 });
    }

    if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_TOPUP_COINS) {
      return NextResponse.json(
        { error: `amount must be an integer between 1 and ${MAX_TOPUP_COINS}` },
        { status: 400 }
      );
    }

    if (!reason) {
      return NextResponse.json(
        { error: 'reason (>= 8 chars) is required' },
        { status: 400 }
      );
    }

    const correlationId = providedCorrelationId || buildCorrelationId(userId, amount);
    const supabaseAdmin = getSupabaseAdmin();

    const { data: authUserData, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (authUserError) {
      throw authUserError;
    }

    if (!authUserData?.user) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    const { data: applyRows, error: applyError } = await supabaseAdmin.rpc('apply_coin_transaction', {
      p_user_id: userId,
      p_amount: amount,
      p_txn_type: 'admin_adjust',
      p_description: `Admin top-up (${amount} coins)`,
      p_chapter_id: null,
      p_stripe_session_id: null,
      p_reference_type: 'admin_topup',
      p_reference_id: correlationId,
      p_policy_version: MONETIZATION_POLICY_VERSION,
      p_reversal_of_txn_id: null,
      p_reason: reason,
      p_actor_user_id: actor.id,
      p_correlation_id: correlationId,
      p_allow_negative: true,
    });

    if (applyError) {
      const rpcError = parseSupabaseRpcError(applyError);
      if (isConflictRpcError(rpcError)) {
        return NextResponse.json(
          {
            error: 'Unable to apply coin top-up',
            code: rpcError?.code || 'TOPUP_CONFLICT',
            message: rpcError?.message || null,
          },
          { status: 409 }
        );
      }
      throw applyError;
    }

    const applyResult = Array.isArray(applyRows) && applyRows.length > 0
      ? (applyRows[0] as ApplyCoinTransactionResult)
      : null;

    if (!applyResult || !applyResult.success) {
      return NextResponse.json(
        {
          error: 'Unable to apply coin top-up',
          code: applyResult?.message || 'TOPUP_APPLY_FAILED',
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      userId,
      amount,
      transactionId: applyResult.txn_id,
      newBalance: applyResult.new_balance,
      correlationId,
      policyVersion: MONETIZATION_POLICY_VERSION,
    });
  } catch (error) {
    console.error('admin-topup-coins failed:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
