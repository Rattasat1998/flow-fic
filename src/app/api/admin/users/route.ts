import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser, isFinanceAdmin } from '../payments/_lib';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

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
  plan_code: string;
  current_period_end: string | null;
};

function toSafeInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
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

    const supabaseAdmin = getSupabaseAdmin();
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: limit,
    });

    if (authError) {
      throw authError;
    }

    const authUsers = authData?.users || [];
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

    const [{ data: profileRows, error: profileError }, { data: walletRows, error: walletError }, { data: vipRows, error: vipError }] =
      await Promise.all([
        supabaseAdmin
          .from('profiles')
          .select('id, pen_name, avatar_url, created_at, updated_at')
          .in('id', userIds),
        supabaseAdmin
          .from('wallets')
          .select('user_id, coin_balance')
          .in('user_id', userIds),
        supabaseAdmin
          .from('vip_entitlements')
          .select('user_id, status, plan_code, current_period_end')
          .in('user_id', userIds),
      ]);

    if (profileError) {
      throw profileError;
    }
    if (walletError) {
      throw walletError;
    }
    if (vipError) {
      throw vipError;
    }

    const safeProfiles = (profileRows ?? []) as ProfileRow[];
    const safeWallets = (walletRows ?? []) as WalletRow[];
    const safeVips = (vipRows ?? []) as VipRow[];

    const profileMap = new Map(safeProfiles.map((row) => [row.id, row]));
    const walletMap = new Map(safeWallets.map((row) => [row.user_id, row]));
    const vipMap = new Map(safeVips.map((row) => [row.user_id, row]));

    const users = authUsers.map((authUser) => {
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

    return NextResponse.json({
      success: true,
      pagination: {
        page,
        limit,
        total: authData?.total || users.length,
        nextPage: authData?.nextPage || null,
        lastPage: authData?.lastPage || null,
      },
      users,
    });
  } catch (error) {
    console.error('admin-users-list failed:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
