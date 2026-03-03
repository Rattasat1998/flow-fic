import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
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

async function creditUserCoins(userId: string, coins: number, stripeSessionId: string) {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: existingWallet } = await supabaseAdmin
    .from('wallets')
    .select('coin_balance')
    .eq('user_id', userId)
    .maybeSingle();

  const nextBalance = (existingWallet?.coin_balance || 0) + coins;

  const { error: walletError } = await supabaseAdmin
    .from('wallets')
    .upsert(
      {
        user_id: userId,
        coin_balance: nextBalance,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (walletError) {
    throw walletError;
  }

  const { error: txnError } = await supabaseAdmin.from('coin_transactions').insert({
    user_id: userId,
    amount: coins,
    txn_type: 'stripe_topup',
    description: `Stripe top-up (${coins} coins)`,
    stripe_session_id: stripeSessionId,
  });

  if (txnError) {
    throw txnError;
  }
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
  const clientReferenceId = getStringValue(eventObject, 'client_reference_id');
  const metadata = getMetadata(eventObject);
  const userId = metadata.user_id || clientReferenceId;

  if (!sessionId || !userId) return;

  if (sessionMode === 'payment' && metadata.kind === 'coins') {
    const coins = Number(metadata.coin_amount || '0');
    if (Number.isFinite(coins) && coins > 0) {
      await creditUserCoins(userId, coins, sessionId);
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
        await processCheckoutSessionCompleted(event.data.object);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await processSubscriptionUpdatedOrDeleted(event.data.object as StripeSubscriptionObject);
        break;
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook processing failed:', error);

    await supabaseAdmin.from('stripe_events').delete().eq('event_id', event.id);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
