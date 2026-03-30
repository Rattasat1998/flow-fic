import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser, isFinanceAdmin } from '../payments/_lib';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_SEARCH_SCAN_PAGES = 10;
const SEARCH_SCAN_PER_PAGE = 100;
const MAX_SEARCH_SCAN_USERS = 1000;
const FETCH_CHUNK_SIZE = 200;
const MAX_QUERY_LENGTH = 120;

type ProfileRow = {
  id: string;
  pen_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

type WalletRow = {
  user_id: string;
  coin_balance: number;
};

type VipRow = {
  user_id: string;
  status: string;
  plan_code: string | null;
  current_period_end: string | null;
};

type AuthUserRow = {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
};

function toSafeInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeQuery(value: string | null) {
  return (value || '').trim().slice(0, MAX_QUERY_LENGTH);
}

function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function toAuthUserRow(user: {
  id: string;
  email?: string;
  created_at?: string;
  last_sign_in_at?: string;
  email_confirmed_at?: string;
}): AuthUserRow {
  return {
    id: user.id,
    email: user.email || null,
    created_at: user.created_at || null,
    last_sign_in_at: user.last_sign_in_at || null,
    email_confirmed_at: user.email_confirmed_at || null,
  };
}

async function fetchProfilesByUserIds(supabaseAdmin: ReturnType<typeof getSupabaseAdmin>, userIds: string[]) {
  if (userIds.length === 0) return [] as ProfileRow[];

  const profileChunks = await Promise.all(
    chunkArray(userIds, FETCH_CHUNK_SIZE).map(async (chunk) => {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('id, pen_name, avatar_url, created_at, updated_at')
        .in('id', chunk);

      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    })
  );

  return profileChunks.flat();
}

async function fetchWalletsByUserIds(supabaseAdmin: ReturnType<typeof getSupabaseAdmin>, userIds: string[]) {
  if (userIds.length === 0) return [] as WalletRow[];

  const walletChunks = await Promise.all(
    chunkArray(userIds, FETCH_CHUNK_SIZE).map(async (chunk) => {
      const { data, error } = await supabaseAdmin
        .from('wallets')
        .select('user_id, coin_balance')
        .in('user_id', chunk);

      if (error) throw error;
      return (data ?? []) as WalletRow[];
    })
  );

  return walletChunks.flat();
}

async function fetchVipsByUserIds(supabaseAdmin: ReturnType<typeof getSupabaseAdmin>, userIds: string[]) {
  if (userIds.length === 0) return [] as VipRow[];

  const vipChunks = await Promise.all(
    chunkArray(userIds, FETCH_CHUNK_SIZE).map(async (chunk) => {
      const { data, error } = await supabaseAdmin
        .from('vip_entitlements')
        .select('user_id, status, plan_code, current_period_end')
        .in('user_id', chunk);

      if (error) throw error;
      return (data ?? []) as VipRow[];
    })
  );

  return vipChunks.flat();
}

function mapAdminUsers(
  authUsers: AuthUserRow[],
  profileMap: Map<string, ProfileRow>,
  walletMap: Map<string, WalletRow>,
  vipMap: Map<string, VipRow>
) {
  return authUsers.map((authUser) => {
    const profile = profileMap.get(authUser.id);
    const wallet = walletMap.get(authUser.id);
    const vip = vipMap.get(authUser.id);

    return {
      id: authUser.id,
      email: authUser.email || null,
      penName: profile?.pen_name || null,
      avatarUrl: profile?.avatar_url || null,
      coinBalance: wallet?.coin_balance ?? 0,
      vipStatus: vip?.status || 'inactive',
      vipPlanCode: vip?.plan_code || null,
      vipCurrentPeriodEnd: vip?.current_period_end || null,
      createdAt: authUser.created_at || profile?.created_at || null,
      updatedAt: profile?.updated_at || null,
      lastSignInAt: authUser.last_sign_in_at || null,
      emailConfirmedAt: authUser.email_confirmed_at || null,
    };
  });
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

    const search = request.nextUrl.searchParams;
    const page = toSafeInt(search.get('page'), DEFAULT_PAGE, 1, 100000);
    const limit = toSafeInt(search.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT);
    const query = normalizeQuery(search.get('q'));

    const supabaseAdmin = getSupabaseAdmin();

    if (!query) {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: limit,
      });

      if (authError) {
        throw authError;
      }

      const authUsers = (authData?.users || []).map(toAuthUserRow);
      const userIds = authUsers.map((user) => user.id);

      if (userIds.length === 0) {
        return NextResponse.json({
          success: true,
          pagination: {
            page,
            limit,
            total: authData?.total || 0,
            nextPage: authData?.nextPage || null,
            lastPage: authData?.lastPage || null,
          },
          users: [],
        });
      }

      const [profileRows, walletRows, vipRows] = await Promise.all([
        fetchProfilesByUserIds(supabaseAdmin, userIds),
        fetchWalletsByUserIds(supabaseAdmin, userIds),
        fetchVipsByUserIds(supabaseAdmin, userIds),
      ]);

      const profileMap = new Map(profileRows.map((row) => [row.id, row]));
      const walletMap = new Map(walletRows.map((row) => [row.user_id, row]));
      const vipMap = new Map(vipRows.map((row) => [row.user_id, row]));

      return NextResponse.json({
        success: true,
        pagination: {
          page,
          limit,
          total: authData?.total || authUsers.length,
          nextPage: authData?.nextPage || null,
          lastPage: authData?.lastPage || null,
        },
        users: mapAdminUsers(authUsers, profileMap, walletMap, vipMap),
      });
    }

    const queryLower = query.toLowerCase();
    const scannedAuthUsers: AuthUserRow[] = [];

    for (
      let currentPage = 1;
      currentPage <= MAX_SEARCH_SCAN_PAGES && scannedAuthUsers.length < MAX_SEARCH_SCAN_USERS;
      currentPage += 1
    ) {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({
        page: currentPage,
        perPage: SEARCH_SCAN_PER_PAGE,
      });

      if (authError) {
        throw authError;
      }

      const batch = (authData?.users || []).map(toAuthUserRow);
      if (batch.length === 0) {
        break;
      }

      const remainingSlots = MAX_SEARCH_SCAN_USERS - scannedAuthUsers.length;
      scannedAuthUsers.push(...batch.slice(0, remainingSlots));

      if (batch.length < SEARCH_SCAN_PER_PAGE) {
        break;
      }
    }

    const scannedUserIds = scannedAuthUsers.map((user) => user.id);
    const profileRows = await fetchProfilesByUserIds(supabaseAdmin, scannedUserIds);
    const profileMap = new Map(profileRows.map((row) => [row.id, row]));

    const filteredAuthUsers = scannedAuthUsers.filter((user) => {
      const penName = profileMap.get(user.id)?.pen_name || '';
      const haystack = `${user.id} ${user.email || ''} ${penName}`.toLowerCase();
      return haystack.includes(queryLower);
    });

    const total = filteredAuthUsers.length;
    const lastPage = total === 0 ? 0 : Math.ceil(total / limit);
    const from = (page - 1) * limit;
    const to = from + limit;
    const pagedAuthUsers = filteredAuthUsers.slice(from, to);

    const pageUserIds = pagedAuthUsers.map((user) => user.id);
    const [walletRows, vipRows] = await Promise.all([
      fetchWalletsByUserIds(supabaseAdmin, pageUserIds),
      fetchVipsByUserIds(supabaseAdmin, pageUserIds),
    ]);

    const walletMap = new Map(walletRows.map((row) => [row.user_id, row]));
    const vipMap = new Map(vipRows.map((row) => [row.user_id, row]));

    return NextResponse.json({
      success: true,
      pagination: {
        page,
        limit,
        total,
        nextPage: page < lastPage ? page + 1 : null,
        lastPage,
      },
      users: mapAdminUsers(pagedAuthUsers, profileMap, walletMap, vipMap),
    });
  } catch (error) {
    console.error('admin-users-list failed:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
