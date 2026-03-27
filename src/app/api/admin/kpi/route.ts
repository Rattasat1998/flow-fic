import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser, isFinanceAdmin } from '../payments/_lib';

export const dynamic = 'force-dynamic';

const FUNNEL_STEPS = [
  'page_view',
  'story_view',
  'chapter_read',
  'choice_select',
  'pricing_view',
  'chapter_unlock',
] as const;

const RANGE_OPTIONS = ['today', '7d', '30d', '90d'] as const;
type RangeOption = typeof RANGE_OPTIONS[number];

type RpcOverviewRow = {
  unique_users: number | string | null;
  unique_sessions: number | string | null;
};

type RpcEventBreakdownRow = {
  event_type: string;
  event_count: number | string | null;
};

type RpcTopStoryRow = {
  story_id: string;
  story_title: string | null;
  event_count: number | string | null;
};

type CoinRollupRow = {
  amount: number | null;
  txn_type: string;
};

type PaymentCaseRow = {
  id: string;
  case_type: string;
  status: string;
  user_id: string;
  amount: number;
  currency: string;
  created_at: string;
};

function toNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRange(value: string | null): RangeOption {
  if (!value) return '30d';
  return (RANGE_OPTIONS as readonly string[]).includes(value) ? (value as RangeOption) : '30d';
}

function buildSinceIso(range: RangeOption) {
  const now = new Date();
  if (range === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }

  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function getCoinRollup(sinceIso: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const pageSize = 1000;
  let from = 0;
  let topupCoins = 0;
  let unlockCoins = 0;
  let netCoins = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('coin_transactions')
      .select('amount, txn_type')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    const rows = (data || []) as CoinRollupRow[];
    if (rows.length === 0) break;

    rows.forEach((row) => {
      const amount = toNumber(row.amount);
      netCoins += amount;

      if (row.txn_type === 'stripe_topup' && amount > 0) {
        topupCoins += amount;
      }

      if (row.txn_type === 'chapter_unlock' && amount < 0) {
        unlockCoins += Math.abs(amount);
      }
    });

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return {
    topupCoins,
    unlockCoins,
    netCoins,
  };
}

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthenticatedUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isFinanceAdmin(actor.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const range = normalizeRange(request.nextUrl.searchParams.get('range'));
    const sinceIso = buildSinceIso(range);
    const nowIso = new Date().toISOString();
    const supabaseAdmin = getSupabaseAdmin();

    const [
      coinRollup,
      { data: overviewRows, error: overviewError },
      { data: eventBreakdownRows, error: eventBreakdownError },
      { data: topStoryRows, error: topStoryError },
      { count: publishedStoriesCount, error: publishedStoriesError },
      { count: activeVipCount, error: activeVipError },
      { count: openPaymentCaseCount, error: openPaymentCaseError },
      { data: recentPaymentCaseRows, error: recentPaymentCaseError },
    ] = await Promise.all([
      getCoinRollup(sinceIso),
      supabaseAdmin.rpc('get_analytics_overview', { p_since: sinceIso }),
      supabaseAdmin.rpc('get_event_breakdown', { p_since: sinceIso }),
      supabaseAdmin.rpc('get_top_stories', { p_since: sinceIso, p_limit: 10 }),
      supabaseAdmin
        .from('stories')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published')
        .gte('created_at', sinceIso),
      supabaseAdmin
        .from('vip_entitlements')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .or(`current_period_end.is.null,current_period_end.gt.${nowIso}`),
      supabaseAdmin
        .from('payment_cases')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open'),
      supabaseAdmin
        .from('payment_cases')
        .select('id, case_type, status, user_id, amount, currency, created_at')
        .order('created_at', { ascending: false })
        .limit(8),
    ]);

    if (overviewError) throw overviewError;
    if (eventBreakdownError) throw eventBreakdownError;
    if (topStoryError) throw topStoryError;
    if (publishedStoriesError) throw publishedStoriesError;
    if (activeVipError) throw activeVipError;
    if (openPaymentCaseError) throw openPaymentCaseError;
    if (recentPaymentCaseError) throw recentPaymentCaseError;

    const overview = ((overviewRows as RpcOverviewRow[] | null)?.[0] || {
      unique_users: 0,
      unique_sessions: 0,
    }) as RpcOverviewRow;

    const funnelResults = await Promise.all(
      FUNNEL_STEPS.map((step) =>
        supabaseAdmin
          .from('page_events')
          .select('*', { count: 'exact', head: true })
          .eq('event_type', step)
          .gte('created_at', sinceIso)
      )
    );

    const funnel = FUNNEL_STEPS.map((step, index) => ({
      step,
      count: funnelResults[index].count || 0,
    }));

    return NextResponse.json({
      success: true,
      range,
      since: sinceIso,
      generatedAt: new Date().toISOString(),
      cards: {
        topupCoins: coinRollup.topupCoins,
        unlockCoins: coinRollup.unlockCoins,
        netCoins: coinRollup.netCoins,
        activeVipNow: activeVipCount || 0,
        uniqueUsers: toNumber(overview.unique_users),
        uniqueSessions: toNumber(overview.unique_sessions),
        publishedStories: publishedStoriesCount || 0,
        openPaymentCases: openPaymentCaseCount || 0,
      },
      eventBreakdown: ((eventBreakdownRows || []) as RpcEventBreakdownRow[]).map((item) => ({
        eventType: item.event_type,
        count: toNumber(item.event_count),
      })),
      funnel,
      topStories: ((topStoryRows || []) as RpcTopStoryRow[]).map((item) => ({
        storyId: item.story_id,
        storyTitle: item.story_title || 'ไม่ทราบชื่อเรื่อง',
        count: toNumber(item.event_count),
      })),
      recentPaymentCases: ((recentPaymentCaseRows || []) as PaymentCaseRow[]).map((item) => ({
        id: item.id,
        caseType: item.case_type,
        status: item.status,
        userId: item.user_id,
        amount: item.amount,
        currency: item.currency,
        createdAt: item.created_at,
      })),
    });
  } catch (error) {
    console.error('admin-kpi failed:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

