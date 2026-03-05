import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser, isFinanceAdmin } from '../_lib';

type ReconcilePayload = {
  windowStart?: string;
  windowEnd?: string;
  mismatchThreshold?: number;
};

type ReconcileResult = {
  run_id: string;
  status: 'ok' | 'alert';
  expected_sessions: number;
  posted_sessions: number;
  missing_sessions: number;
  extra_sessions: number;
  expected_coins: number;
  posted_coins: number;
};

function toIsoOrNull(value: unknown) {
  if (typeof value !== 'string') return null;
  const iso = value.trim();
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
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

    const body = (await request.json()) as ReconcilePayload;
    const windowStart = toIsoOrNull(body.windowStart) || null;
    const windowEnd = toIsoOrNull(body.windowEnd) || null;
    const mismatchThreshold = Number.isFinite(Number(body.mismatchThreshold))
      ? Math.max(0, Math.floor(Number(body.mismatchThreshold)))
      : 0;

    const supabaseAdmin = getSupabaseAdmin();
    const rpcArgs: Record<string, unknown> = {
      p_mismatch_threshold: mismatchThreshold,
    };
    if (windowStart) rpcArgs.p_window_start = windowStart;
    if (windowEnd) rpcArgs.p_window_end = windowEnd;

    const { data, error } = await supabaseAdmin.rpc('run_payment_reconciliation', rpcArgs);

    if (error) {
      throw error;
    }

    const result = Array.isArray(data) && data.length > 0
      ? (data[0] as ReconcileResult)
      : null;

    if (!result) {
      throw new Error('Missing reconciliation result');
    }

    if (result.status === 'alert') {
      console.error('PAYMENT_RECONCILIATION_ALERT', {
        runId: result.run_id,
        expectedSessions: result.expected_sessions,
        postedSessions: result.posted_sessions,
        missingSessions: result.missing_sessions,
        extraSessions: result.extra_sessions,
        expectedCoins: result.expected_coins,
        postedCoins: result.posted_coins,
      });
    }

    return NextResponse.json({
      success: true,
      alert: result.status === 'alert',
      run: {
        runId: result.run_id,
        status: result.status,
        expectedSessions: result.expected_sessions,
        postedSessions: result.posted_sessions,
        missingSessions: result.missing_sessions,
        extraSessions: result.extra_sessions,
        expectedCoins: result.expected_coins,
        postedCoins: result.posted_coins,
      },
    });
  } catch (error) {
    console.error('reconcile failed:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
