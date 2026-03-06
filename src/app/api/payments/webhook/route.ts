import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { MONETIZATION_POLICY_VERSION } from '@/lib/monetization-policy';
import { getStripeSubscription } from '@/lib/server/stripe-api';

type StripeEvent = {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
};

type StripeEventEnvelope = StripeEvent;

type StripeSubscriptionObject = {
  id: string;
  status: string;
  current_period_end?: number;
  customer?: string;
  metadata?: Record<string, string>;
};

type ApplyCoinTransactionResult = {
  success: boolean;
  message: string;
  txn_id: string | null;
  new_balance: number;
};

const SIGNATURE_TOLERANCE_SECONDS = 300;

function parseStripeSignatureHeader(signatureHeader: string) {
  const pairs = signatureHeader.split(',').map((item) => item.trim());
  const timestampPair = pairs.find((pair) => pair.startsWith('t='));
  const v1Signatures = pairs
    .filter((pair) => pair.startsWith('v1='))
    .map((pair) => pair.slice(3))
    .filter(Boolean);

  return {
    timestamp: timestampPair ? Number(timestampPair.slice(2)) : NaN,
    signatures: v1Signatures,
  };
}

function safeEqualHex(a: string, b: string) {
  const aBuf = Buffer.from(a, 'hex');
  const bBuf = Buffer.from(b, 'hex');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyStripeSignature(rawBody: string, signatureHeader: string, webhookSecret: string) {
  const { timestamp, signatures } = parseStripeSignatureHeader(signatureHeader);
  if (!Number.isFinite(timestamp) || signatures.length === 0) return false;

  const ageSeconds = Math.floor(Date.now() / 1000) - timestamp;
  if (Math.abs(ageSeconds) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(signedPayload, 'utf8').digest('hex');

  return signatures.some((sig) => safeEqualHex(sig, expectedSignature));
}

function normalizeVipStatus(status: string): 'active' | 'inactive' | 'past_due' | 'canceled' {
  if (status === 'active' || status === 'trialing') return 'active';
  if (status === 'past_due' || status === 'unpaid') return 'past_due';
  if (status === 'canceled' || status === 'incomplete_expired') return 'canceled';
  return 'inactive';
}

function getStringValue(obj: Record<string, unknown>, key: string) {
  const value = obj[key];
  return typeof value === 'string' ? value : null;
}

function getNumberValue(obj: Record<string, unknown>, key: string) {
  const value = obj[key];
  return typeof value === 'number' ? value : null;
}

function getMetadata(obj: Record<string, unknown>) {
  const raw = obj.metadata;
  if (!raw || typeof raw !== 'object') return {};

  const metadata: Record<string, string> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    if (typeof value === 'string') metadata[key] = value;
  });
  return metadata;
}

async function postCoinTransaction(params: {
  userId: string;
  amount: number;
  stripeSessionId: string;
  policyVersion?: string;
  reason?: string;
}) {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin.rpc('apply_coin_transaction', {
    p_user_id: params.userId,
    p_amount: params.amount,
    p_txn_type: 'stripe_topup',
    p_description: `Stripe top-up (${params.amount} coins)`,
    p_chapter_id: null,
    p_stripe_session_id: params.stripeSessionId,
    p_reference_type: 'stripe_session',
    p_reference_id: params.stripeSessionId,
    p_policy_version: params.policyVersion || MONETIZATION_POLICY_VERSION,
    p_reversal_of_txn_id: null,
    p_reason: params.reason || 'Stripe checkout settled',
    p_actor_user_id: null,
    p_correlation_id: `stripe:${params.stripeSessionId}`,
    p_allow_negative: false,
  });

  if (error) {
    throw error;
  }

  const result = (Array.isArray(data) && data.length > 0
    ? (data[0] as ApplyCoinTransactionResult)
    : null);

  if (!result) {
    throw new Error('Missing apply_coin_transaction result');
  }

  if (!result.success && result.message === 'DUPLICATE_REFERENCE') {
    return { duplicate: true, newBalance: result.new_balance, txnId: result.txn_id };
  }

  if (!result.success) {
    throw new Error(`apply_coin_transaction failed: ${result.message}`);
  }

  return { duplicate: false, newBalance: result.new_balance, txnId: result.txn_id };
}

async function upsertVipEntitlement(
  userId: string,
  payload: {
    status: string;
    currentPeriodEnd: number | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  }
) {
  const supabaseAdmin = getSupabaseAdmin();
  const currentPeriodEndIso = payload.currentPeriodEnd
    ? new Date(payload.currentPeriodEnd * 1000).toISOString()
    : null;

  const { error } = await supabaseAdmin.from('vip_entitlements').upsert(
    {
      user_id: userId,
      status: normalizeVipStatus(payload.status),
      current_period_end: currentPeriodEndIso,
      stripe_customer_id: payload.stripeCustomerId,
      stripe_subscription_id: payload.stripeSubscriptionId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    throw error;
  }
}

async function resolveVipUserIdFromSubscription(
  subscriptionId: string | null,
  fallbackCustomerId: string | null
) {
  if (!subscriptionId && !fallbackCustomerId) return null;

  const supabaseAdmin = getSupabaseAdmin();
  let query = supabaseAdmin.from('vip_entitlements').select('user_id').limit(1);

  if (subscriptionId) {
    query = query.eq('stripe_subscription_id', subscriptionId);
  } else if (fallbackCustomerId) {
    query = query.eq('stripe_customer_id', fallbackCustomerId);
  }

  const { data } = await query.maybeSingle();
  return data?.user_id || null;
}

async function processCheckoutSessionCompleted(eventObject: Record<string, unknown>) {
  const sessionMode = getStringValue(eventObject, 'mode');
  const sessionId = getStringValue(eventObject, 'id');
  const paymentStatus = getStringValue(eventObject, 'payment_status');
  const clientReferenceId = getStringValue(eventObject, 'client_reference_id');
  const metadata = getMetadata(eventObject);
  const userId = metadata.user_id || clientReferenceId;

  if (!sessionId || !userId) return;

  if (sessionMode === 'payment' && metadata.kind === 'coins') {
    if (paymentStatus !== 'paid') {
      return;
    }

    const coins = Number(metadata.coin_amount || '0');
    if (Number.isFinite(coins) && coins > 0) {
      await postCoinTransaction({
        userId,
        amount: coins,
        stripeSessionId: sessionId,
        policyVersion: metadata.policy_version,
        reason: 'Stripe paid checkout.session.completed',
      });
    }
    return;
  }

  if (sessionMode === 'subscription' && metadata.kind === 'vip') {
    const subscriptionId = getStringValue(eventObject, 'subscription');
    const customerId = getStringValue(eventObject, 'customer');
    if (!subscriptionId) return;

    const subscriptionRes = await getStripeSubscription(subscriptionId);
    if (!subscriptionRes.ok) {
      throw new Error(`Failed to fetch Stripe subscription ${subscriptionId}`);
    }

    await upsertVipEntitlement(userId, {
      status: subscriptionRes.data.status,
      currentPeriodEnd: subscriptionRes.data.current_period_end || null,
      stripeCustomerId: customerId || subscriptionRes.data.customer,
      stripeSubscriptionId: subscriptionRes.data.id,
    });
  }
}

async function processSubscriptionUpdatedOrDeleted(eventObject: Record<string, unknown>) {
  const subscriptionId = getStringValue(eventObject, 'id');
  const customerId = getStringValue(eventObject, 'customer');
  const status = getStringValue(eventObject, 'status');
  const currentPeriodEnd = getNumberValue(eventObject, 'current_period_end');
  const metadata = getMetadata(eventObject);
  const metadataUserId = metadata.user_id || null;

  const userId =
    metadataUserId || (await resolveVipUserIdFromSubscription(subscriptionId, customerId));

  if (!userId || !status) return;

  await upsertVipEntitlement(userId, {
    status,
    currentPeriodEnd,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
  });
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Missing STRIPE_WEBHOOK_SECRET' }, { status: 500 });
  }

  const signatureHeader = request.headers.get('stripe-signature');
  if (!signatureHeader) {
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
  }

  const rawBody = await request.text();
  const isValid = verifyStripeSignature(rawBody, signatureHeader, webhookSecret);
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid Stripe signature' }, { status: 400 });
  }

  let event: StripeEventEnvelope;
  try {
    event = JSON.parse(rawBody) as StripeEventEnvelope;
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { error: insertEventError } = await supabaseAdmin.from('stripe_events').insert({
    event_id: event.id,
    event_type: event.type,
    event_payload: event,
    processing_status: 'received',
  });

  if (insertEventError?.code === '23505') {
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (insertEventError) {
    return NextResponse.json({ error: 'Failed to persist event' }, { status: 500 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await processCheckoutSessionCompleted(event.data.object);
        break;
      case 'checkout.session.async_payment_failed':
        // Keep event in audit log; no ledger side effect for failed async payment.
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await processSubscriptionUpdatedOrDeleted(event.data.object as StripeSubscriptionObject);
        break;
      default:
        break;
    }

    await supabaseAdmin
      .from('stripe_events')
      .update({
        processing_status: 'processed',
        processed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('event_id', event.id);

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook processing failed';
    console.error('Stripe webhook processing failed:', error);

    await supabaseAdmin
      .from('stripe_events')
      .update({
        processing_status: 'failed',
        processed_at: new Date().toISOString(),
        last_error: message,
      })
      .eq('event_id', event.id);

    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
