import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser } from '../../_lib';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function toSafeLimit(value: string | null) {
  const parsed = Number(value || DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsed)));
}

type RequestRow = {
  id: string;
  status: string;
  gross_satang: number;
  withholding_bps: number;
  withholding_satang: number;
  net_satang: number;
  promptpay_target: string | null;
  transfer_reference: string | null;
  transfer_proof_url: string | null;
  request_note: string | null;
  requested_at: string;
  approved_at: string | null;
  paid_at: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = toSafeLimit(request.nextUrl.searchParams.get('limit'));
    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from('creator_payout_requests')
      .select('id, status, gross_satang, withholding_bps, withholding_satang, net_satang, promptpay_target, transfer_reference, transfer_proof_url, request_note, requested_at, approved_at, paid_at, rejected_at, reject_reason')
      .eq('writer_user_id', user.id)
      .order('requested_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const history = ((data || []) as RequestRow[]).map((row) => ({
      id: row.id,
      status: row.status,
      grossSatang: Number(row.gross_satang || 0),
      withholdingBps: Number(row.withholding_bps || 0),
      withholdingSatang: Number(row.withholding_satang || 0),
      netSatang: Number(row.net_satang || 0),
      promptpayTarget: row.promptpay_target,
      transferReference: row.transfer_reference,
      transferProofUrl: row.transfer_proof_url,
      requestNote: row.request_note,
      requestedAt: row.requested_at,
      approvedAt: row.approved_at,
      paidAt: row.paid_at,
      rejectedAt: row.rejected_at,
      rejectReason: row.reject_reason,
    }));

    return NextResponse.json({ success: true, history });
  } catch (error) {
    console.error('writer-payout-history failed:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
