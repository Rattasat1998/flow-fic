import { NextRequest, NextResponse } from 'next/server';
import { getAccessTokenFromRequest, getAuthenticatedUser, getUserSupabaseClient } from '../../_lib';

type RequestBody = {
  amountSatang?: number;
  note?: string;
};

type RequestPayoutResult = {
  success: boolean;
  message: string;
  payout_request_id: string | null;
  gross_satang: number;
  withholding_satang: number;
  net_satang: number;
};

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accessToken = getAccessTokenFromRequest(request);
    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as RequestBody;

    const amountSatang = Number(body.amountSatang || 0);
    const normalizedAmount = Number.isFinite(amountSatang) && amountSatang > 0
      ? Math.floor(amountSatang)
      : null;
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : null;

    const supabase = getUserSupabaseClient(accessToken);
    const { data, error } = await supabase.rpc('request_creator_payout', {
      p_amount_satang: normalizedAmount,
      p_request_note: note,
    });

    if (error) {
      throw error;
    }

    const result = Array.isArray(data) && data.length > 0
      ? (data[0] as RequestPayoutResult)
      : null;

    if (!result || !result.success) {
      return NextResponse.json(
        {
          error: result?.message || 'Request payout failed',
          code: result?.message || 'REQUEST_PAYOUT_FAILED',
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      payoutRequestId: result.payout_request_id,
      grossSatang: Number(result.gross_satang || 0),
      withholdingSatang: Number(result.withholding_satang || 0),
      netSatang: Number(result.net_satang || 0),
      message: result.message,
    });
  } catch (error) {
    console.error('writer-payout-request failed:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
