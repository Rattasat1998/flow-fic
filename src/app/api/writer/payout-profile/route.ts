import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser } from '../_lib';

type ProfileBody = {
  legalName?: string;
  promptpayTarget?: string;
};

type ProfileRow = {
  writer_user_id: string;
  legal_name: string | null;
  promptpay_target: string | null;
  kyc_status: 'pending' | 'verified' | 'rejected';
  kyc_rejection_reason: string | null;
  verified_at: string | null;
  updated_at: string;
};

function normalizeOptionalString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('creator_payout_profiles')
      .select('writer_user_id, legal_name, promptpay_target, kyc_status, kyc_rejection_reason, verified_at, updated_at')
      .eq('writer_user_id', user.id)
      .maybeSingle();

    if (error) throw error;

    const row = (data as ProfileRow | null) || null;
    return NextResponse.json({
      success: true,
      profile: row
        ? {
            writerUserId: row.writer_user_id,
            legalName: row.legal_name,
            promptpayTarget: row.promptpay_target,
            kycStatus: row.kyc_status,
            kycRejectionReason: row.kyc_rejection_reason,
            verifiedAt: row.verified_at,
            updatedAt: row.updated_at,
          }
        : null,
    });
  } catch (error) {
    console.error('writer-payout-profile GET failed:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as ProfileBody;
    const legalName = normalizeOptionalString(body.legalName, 120);
    const promptpayTarget = normalizeOptionalString(body.promptpayTarget, 64);

    if (!legalName || !promptpayTarget) {
      return NextResponse.json(
        { error: 'legalName and promptpayTarget are required' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: existingRow, error: fetchError } = await supabaseAdmin
      .from('creator_payout_profiles')
      .select('legal_name, promptpay_target, kyc_status')
      .eq('writer_user_id', user.id)
      .maybeSingle();

    if (fetchError) throw fetchError;

    const current = (existingRow as { legal_name: string | null; promptpay_target: string | null; kyc_status: string } | null) || null;
    const hasChanged =
      (current?.legal_name || null) !== legalName ||
      (current?.promptpay_target || null) !== promptpayTarget;

    const nextStatus = hasChanged ? 'pending' : (current?.kyc_status || 'pending');

    const { data, error } = await supabaseAdmin
      .from('creator_payout_profiles')
      .upsert(
        {
          writer_user_id: user.id,
          legal_name: legalName,
          promptpay_target: promptpayTarget,
          kyc_status: nextStatus,
          kyc_rejection_reason: hasChanged ? null : undefined,
          verified_at: hasChanged ? null : undefined,
          verified_by: hasChanged ? null : undefined,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'writer_user_id' }
      )
      .select('writer_user_id, legal_name, promptpay_target, kyc_status, kyc_rejection_reason, verified_at, updated_at')
      .single();

    if (error) throw error;

    const row = data as ProfileRow;

    return NextResponse.json({
      success: true,
      profile: {
        writerUserId: row.writer_user_id,
        legalName: row.legal_name,
        promptpayTarget: row.promptpay_target,
        kycStatus: row.kyc_status,
        kycRejectionReason: row.kyc_rejection_reason,
        verifiedAt: row.verified_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    console.error('writer-payout-profile POST failed:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
