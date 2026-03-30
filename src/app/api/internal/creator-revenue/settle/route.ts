import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type SettleCreatorRevenueRow = {
  settled_count: number;
  moved_satang: number;
};

type ParseAtResult = {
  atIso: string | null;
  invalid: boolean;
};

function parseAtValue(value: unknown): ParseAtResult {
  if (value === null || value === undefined || value === '') {
    return { atIso: null, invalid: false };
  }

  if (typeof value !== 'string') {
    return { atIso: null, invalid: true };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { atIso: null, invalid: true };
  }

  return { atIso: parsed.toISOString(), invalid: false };
}

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = request.headers.get('authorization') || '';
  return authHeader === `Bearer ${cronSecret}`;
}

async function resolveRequestedAt(request: NextRequest) {
  const fromQuery = parseAtValue(request.nextUrl.searchParams.get('at'));
  if (fromQuery.invalid) {
    return { atIso: null, invalid: true };
  }
  if (fromQuery.atIso) {
    return fromQuery;
  }

  if (request.method !== 'POST') {
    return { atIso: null, invalid: false };
  }

  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { atIso: null, invalid: false };
    }

    const raw = (await request.json()) as { at?: unknown };
    return parseAtValue(raw?.at);
  } catch {
    return { atIso: null, invalid: true };
  }
}

async function runSettle(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json({ error: 'Missing CRON_SECRET' }, { status: 500 });
    }

    if (!isAuthorizedCronRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 });
    }

    const requestedAt = await resolveRequestedAt(request);
    if (requestedAt.invalid) {
      return NextResponse.json({ error: 'Invalid `at` format' }, { status: 400 });
    }

    const executedAt = requestedAt.atIso || new Date().toISOString();

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.rpc('settle_creator_revenue', {
      p_now: executedAt,
    });

    if (error) {
      throw error;
    }

    const result = Array.isArray(data) && data.length > 0
      ? (data[0] as SettleCreatorRevenueRow)
      : null;

    const settledCount = Number(result?.settled_count || 0);
    const movedSatang = Number(result?.moved_satang || 0);

    console.info('CREATOR_REVENUE_SETTLE', {
      settled_count: settledCount,
      moved_satang: movedSatang,
      executed_at: executedAt,
    });

    return NextResponse.json({
      success: true,
      settledCount,
      movedSatang,
      executedAt,
    });
  } catch (error) {
    console.error('internal-creator-revenue-settle failed:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return runSettle(request);
}

export async function POST(request: NextRequest) {
  return runSettle(request);
}
