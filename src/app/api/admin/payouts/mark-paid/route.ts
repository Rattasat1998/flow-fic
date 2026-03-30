import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser, isFinanceAdmin } from '../../payments/_lib';

type Payload = {
  payoutRequestId?: string;
  transferReference?: string;
  transferProofUrl?: string;
};

type RpcResult = {
  success: boolean;
  message: string;
};

export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthenticatedUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isFinanceAdmin(actor.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as Payload;
    const payoutRequestId = (body.payoutRequestId || '').trim();
    const transferReference = (body.transferReference || '').trim();
    const transferProofUrl = typeof body.transferProofUrl === 'string'
      ? body.transferProofUrl.trim().slice(0, 1000)
      : null;

    if (!payoutRequestId || !transferReference) {
      return NextResponse.json(
        { error: 'payoutRequestId and transferReference are required' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.rpc('admin_mark_creator_payout_paid', {
      p_request_id: payoutRequestId,
      p_actor_user_id: actor.id,
      p_transfer_reference: transferReference,
      p_transfer_proof_url: transferProofUrl,
    });

    if (error) throw error;

    const result = Array.isArray(data) && data.length > 0
      ? (data[0] as RpcResult)
      : null;

    if (!result || !result.success) {
      return NextResponse.json(
        { error: result?.message || 'Mark paid failed', code: result?.message || 'MARK_PAID_FAILED' },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, message: result.message, payoutRequestId });
  } catch (error) {
    console.error('admin-payout-mark-paid failed:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
