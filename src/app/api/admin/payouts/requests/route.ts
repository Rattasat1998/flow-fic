import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser, isFinanceAdmin } from '../../payments/_lib';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function toSafeLimit(value: string | null) {
  const parsed = Number(value || DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsed)));
}

function normalizeId(value: string | null) {
  const normalized = (value || '').trim();
  return normalized || null;
}

type RequestRow = {
  id: string;
  writer_user_id: string;
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
  approved_by: string | null;
  paid_at: string | null;
  paid_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  reject_reason: string | null;
};

type ProfileRow = {
  writer_user_id: string;
  legal_name: string | null;
  kyc_status: string;
  promptpay_target: string | null;
};

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
    const status = normalizeId(search.get('status'));
    const writerId = normalizeId(search.get('writerId'));
    const limit = toSafeLimit(search.get('limit'));

    const supabaseAdmin = getSupabaseAdmin();

    let query = supabaseAdmin
      .from('creator_payout_requests')
      .select('id, writer_user_id, status, gross_satang, withholding_bps, withholding_satang, net_satang, promptpay_target, transfer_reference, transfer_proof_url, request_note, requested_at, approved_at, approved_by, paid_at, paid_by, rejected_at, rejected_by, reject_reason')
      .order('requested_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }

    if (writerId) {
      query = query.eq('writer_user_id', writerId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const requests = (data || []) as RequestRow[];
    const writerIds = Array.from(new Set(requests.map((row) => row.writer_user_id)));
    const requestIds = requests.map((row) => row.id);

    const [{ data: profileRows }, { data: itemCountRows }] = await Promise.all([
      writerIds.length > 0
        ? supabaseAdmin
            .from('creator_payout_profiles')
            .select('writer_user_id, legal_name, kyc_status, promptpay_target')
            .in('writer_user_id', writerIds)
        : Promise.resolve({ data: [] as ProfileRow[] }),
      requestIds.length > 0
        ? supabaseAdmin
            .from('creator_payout_request_items')
            .select('payout_request_id, id')
            .in('payout_request_id', requestIds)
        : Promise.resolve({ data: [] as Array<{ payout_request_id: string; id: string }> }),
    ]);

    const profileMap = new Map(((profileRows || []) as ProfileRow[]).map((row) => [row.writer_user_id, row]));
    const countMap = new Map<string, number>();
    ((itemCountRows || []) as Array<{ payout_request_id: string; id: string }>).forEach((row) => {
      countMap.set(row.payout_request_id, (countMap.get(row.payout_request_id) || 0) + 1);
    });

    return NextResponse.json({
      success: true,
      requests: requests.map((row) => {
        const profile = profileMap.get(row.writer_user_id) || null;
        return {
          id: row.id,
          writerUserId: row.writer_user_id,
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
          approvedBy: row.approved_by,
          paidAt: row.paid_at,
          paidBy: row.paid_by,
          rejectedAt: row.rejected_at,
          rejectedBy: row.rejected_by,
          rejectReason: row.reject_reason,
          itemCount: countMap.get(row.id) || 0,
          profile: profile
            ? {
                legalName: profile.legal_name,
                kycStatus: profile.kyc_status,
                promptpayTarget: profile.promptpay_target,
              }
            : null,
        };
      }),
      filter: {
        status,
        writerId,
        limit,
      },
    });
  } catch (error) {
    console.error('admin-payout-requests failed:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
