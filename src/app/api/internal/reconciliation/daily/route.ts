import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

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

function toIsoOrNull(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function getDefaultMismatchThreshold() {
  const raw = process.env.RECONCILIATION_MISMATCH_THRESHOLD || '0';
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = request.headers.get('authorization') || '';
  return authHeader === `Bearer ${cronSecret}`;
}

async function runDailyReconciliation(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json({ error: 'Missing CRON_SECRET' }, { status: 500 });
    }

    if (!isAuthorizedCronRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 });
    }

    const windowStart = toIsoOrNull(request.nextUrl.searchParams.get('windowStart'));
    const windowEnd = toIsoOrNull(request.nextUrl.searchParams.get('windowEnd'));
    const thresholdParam = request.nextUrl.searchParams.get('mismatchThreshold');
    const mismatchThreshold = thresholdParam
      ? Math.max(0, Math.floor(Number(thresholdParam)))
      : getDefaultMismatchThreshold();

    const rpcArgs: Record<string, unknown> = {
      p_mismatch_threshold: Number.isFinite(mismatchThreshold) ? mismatchThreshold : 0,
    };
    if (windowStart) rpcArgs.p_window_start = windowStart;
    if (windowEnd) rpcArgs.p_window_end = windowEnd;

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.rpc('run_payment_reconciliation', rpcArgs);
    if (error) throw error;

    const result = Array.isArray(data) && data.length > 0
      ? (data[0] as ReconcileResult)
      : null;

    if (!result) {
      throw new Error('Missing reconciliation result');
    }

    if (result.status === 'alert') {
      console.error('PAYMENT_RECONCILIATION_DAILY_ALERT', {
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
    console.error('daily-reconciliation failed:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return runDailyReconciliation(request);
}

export async function POST(request: NextRequest) {
  return runDailyReconciliation(request);
}

