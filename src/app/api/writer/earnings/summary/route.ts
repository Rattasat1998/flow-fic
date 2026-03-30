import { NextRequest, NextResponse } from 'next/server';
import {
  CREATOR_BASE_RATE_SATANG_PER_COIN,
  CREATOR_HOLD_DAYS,
  CREATOR_MIN_PAYOUT_SATANG,
  CREATOR_SHARE_BPS,
  CREATOR_WITHHOLDING_BPS,
} from '@/lib/creator-payout';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser } from '../../_lib';

type CreatorBalanceRow = {
  pending_satang: number;
  available_satang: number;
  reserved_satang: number;
  paid_satang: number;
  debt_satang: number;
  updated_at: string;
};

type CreatorProfileRow = {
  legal_name: string | null;
  promptpay_target: string | null;
  kyc_status: 'pending' | 'verified' | 'rejected';
  kyc_rejection_reason: string | null;
  verified_at: string | null;
  updated_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    await supabaseAdmin.rpc('settle_creator_revenue', {
      p_now: new Date().toISOString(),
    });

    const [{ data: balanceRow }, { data: profileRow }, { data: requestRows }] = await Promise.all([
      supabaseAdmin
        .from('creator_balances')
        .select('pending_satang, available_satang, reserved_satang, paid_satang, debt_satang, updated_at')
        .eq('writer_user_id', user.id)
        .maybeSingle(),
      supabaseAdmin
        .from('creator_payout_profiles')
        .select('legal_name, promptpay_target, kyc_status, kyc_rejection_reason, verified_at, updated_at')
        .eq('writer_user_id', user.id)
        .maybeSingle(),
      supabaseAdmin
        .from('creator_payout_requests')
        .select('status')
        .eq('writer_user_id', user.id)
        .order('requested_at', { ascending: false })
        .limit(50),
    ]);

    const balance = (balanceRow as CreatorBalanceRow | null) || {
      pending_satang: 0,
      available_satang: 0,
      reserved_satang: 0,
      paid_satang: 0,
      debt_satang: 0,
      updated_at: new Date().toISOString(),
    };

    const profile = (profileRow as CreatorProfileRow | null) || null;
    const requests = (requestRows || []) as Array<{ status: string }>;

    const requestedCount = requests.filter((item) => item.status === 'requested').length;
    const approvedCount = requests.filter((item) => item.status === 'approved').length;

    const canRequestPayout =
      profile?.kyc_status === 'verified' &&
      !!profile.promptpay_target &&
      balance.debt_satang <= 0 &&
      balance.available_satang >= CREATOR_MIN_PAYOUT_SATANG;

    return NextResponse.json({
      success: true,
      balance: {
        pendingSatang: Number(balance.pending_satang || 0),
        availableSatang: Number(balance.available_satang || 0),
        reservedSatang: Number(balance.reserved_satang || 0),
        paidSatang: Number(balance.paid_satang || 0),
        debtSatang: Number(balance.debt_satang || 0),
        updatedAt: balance.updated_at,
      },
      profile: profile
        ? {
            legalName: profile.legal_name,
            promptpayTarget: profile.promptpay_target,
            kycStatus: profile.kyc_status,
            kycRejectionReason: profile.kyc_rejection_reason,
            verifiedAt: profile.verified_at,
            updatedAt: profile.updated_at,
          }
        : null,
      payoutQueue: {
        requestedCount,
        approvedCount,
      },
      policy: {
        baseRateSatangPerCoin: CREATOR_BASE_RATE_SATANG_PER_COIN,
        creatorShareBps: CREATOR_SHARE_BPS,
        holdDays: CREATOR_HOLD_DAYS,
        minPayoutSatang: CREATOR_MIN_PAYOUT_SATANG,
        withholdingBps: CREATOR_WITHHOLDING_BPS,
      },
      canRequestPayout,
    });
  } catch (error) {
    console.error('writer-earnings-summary failed:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
