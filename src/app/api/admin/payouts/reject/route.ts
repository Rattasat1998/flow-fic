import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser, isFinanceAdmin } from '../../payments/_lib';

type Payload = {
  payoutRequestId?: string;
  reason?: string;
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
    const reason = (body.reason || '').trim();

    if (!payoutRequestId || reason.length < 8) {
      return NextResponse.json(
        { error: 'payoutRequestId and reason (>= 8 chars) are required' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.rpc('admin_reject_creator_payout', {
      p_request_id: payoutRequestId,
      p_actor_user_id: actor.id,
      p_reason: reason,
    });

    if (error) throw error;

    const result = Array.isArray(data) && data.length > 0
      ? (data[0] as RpcResult)
      : null;

    if (!result || !result.success) {
      return NextResponse.json(
        { error: result?.message || 'Reject payout failed', code: result?.message || 'REJECT_PAYOUT_FAILED' },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, message: result.message, payoutRequestId });
  } catch (error) {
    console.error('admin-payout-reject failed:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
