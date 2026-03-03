import { createClient } from 'npm:@supabase/supabase-js@2';
import { getStripeSubscription } from '../_shared/stripe.ts';

type StripeEvent = {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
};

type StripeSubscriptionObject = {
  id: string;
  status: string;
  current_period_end?: number;
  customer?: string;
  metadata?: Record<string, string>;
};

const SIGNATURE_TOLERANCE_SECONDS = 300;
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getSupabaseUrl() {
  const url = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('NEXT_PUBLIC_SUPABASE_URL');
  if (!url) throw new Error('Missing SUPABASE_URL');
  return url;
}

function getSupabaseServiceRoleKey() {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  return key;
}

function parseStripeSignatureHeader(signatureHeader: string) {
  const pairs = signatureHeader.split(',').map((item) => item.trim());
  const timestampPair = pairs.find((pair) => pair.startsWith('t='));
  const v1Signatures = pairs
    .filter((pair) => pair.startsWith('v1='))
    .map((pair) => pair.slice(3))
    .filter(Boolean);

  return {
    timestamp: timestampPair ? Number(timestampPair.slice(2)) : Number.NaN,
    signatures: v1Signatures,
  };
}

function safeEqualHex(a: string, b: string) {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left.length !== right.length) return false;

  let result = 0;
  for (let i = 0; i < left.length; i += 1) {
    result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return result === 0;
}

async function computeHmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyStripeSignature(rawBody: string, signatureHeader: string, webhookSecret: string) {
  const { timestamp, signatures } = parseStripeSignatureHeader(signatureHeader);
  if (!Number.isFinite(timestamp) || signatures.length === 0) return false;

  const ageSeconds = Math.floor(Date.now() / 1000) - timestamp;
  if (Math.abs(ageSeconds) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSignature = await computeHmacHex(webhookSecret, signedPayload);
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

async function creditUserCoins(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  coins: number,
  stripeSessionId: string
) {
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
  if (walletError) throw walletError;

  const { error: txnError } = await supabaseAdmin.from('coin_transactions').insert({
    user_id: userId,
    amount: coins,
    txn_type: 'stripe_topup',
    description: `Stripe top-up (${coins} coins)`,
    stripe_session_id: stripeSessionId,
  });
  if (txnError) throw txnError;
}

async function upsertVipEntitlement(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  payload: {
    status: string;
    currentPeriodEnd: number | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  }
) {
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
  if (error) throw error;
}

async function resolveVipUserIdFromSubscription(
  supabaseAdmin: ReturnType<typeof createClient>,
  subscriptionId: string | null,
  fallbackCustomerId: string | null
) {
  if (!subscriptionId && !fallbackCustomerId) return null;

  let query = supabaseAdmin.from('vip_entitlements').select('user_id').limit(1);
  if (subscriptionId) {
    query = query.eq('stripe_subscription_id', subscriptionId);
  } else if (fallbackCustomerId) {
    query = query.eq('stripe_customer_id', fallbackCustomerId);
  }

  const { data } = await query.maybeSingle();
  return data?.user_id || null;
}

async function processCheckoutSessionCompleted(
  supabaseAdmin: ReturnType<typeof createClient>,
  eventObject: Record<string, unknown>
) {
  const sessionMode = getStringValue(eventObject, 'mode');
  const sessionId = getStringValue(eventObject, 'id');
  const clientReferenceId = getStringValue(eventObject, 'client_reference_id');
  const metadata = getMetadata(eventObject);
  const userId = metadata.user_id || clientReferenceId;

  if (!sessionId || !userId) return;

  if (sessionMode === 'payment' && metadata.kind === 'coins') {
    const coins = Number(metadata.coin_amount || '0');
    if (Number.isFinite(coins) && coins > 0) {
      await creditUserCoins(supabaseAdmin, userId, coins, sessionId);
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

    await upsertVipEntitlement(supabaseAdmin, userId, {
      status: subscriptionRes.data.status,
      currentPeriodEnd: subscriptionRes.data.current_period_end || null,
      stripeCustomerId: customerId || subscriptionRes.data.customer,
      stripeSubscriptionId: subscriptionRes.data.id,
    });
  }
}

async function processSubscriptionChanged(
  supabaseAdmin: ReturnType<typeof createClient>,
  eventObject: Record<string, unknown>
) {
  const subscriptionId = getStringValue(eventObject, 'id');
  const customerId = getStringValue(eventObject, 'customer');
  const status = getStringValue(eventObject, 'status');
  const currentPeriodEnd = getNumberValue(eventObject, 'current_period_end');
  const metadata = getMetadata(eventObject);
  const metadataUserId = metadata.user_id || null;

  const userId =
    metadataUserId || (await resolveVipUserIdFromSubscription(supabaseAdmin, subscriptionId, customerId));

  if (!userId || !status) return;

  await upsertVipEntitlement(supabaseAdmin, userId, {
    status,
    currentPeriodEnd,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      return jsonResponse({ error: 'Missing STRIPE_WEBHOOK_SECRET' }, 500);
    }

    const signatureHeader = request.headers.get('stripe-signature');
    if (!signatureHeader) {
      return jsonResponse({ error: 'Missing Stripe signature' }, 400);
    }

    const rawBody = await request.text();
    const isValid = await verifyStripeSignature(rawBody, signatureHeader, webhookSecret);
    if (!isValid) {
      return jsonResponse({ error: 'Invalid Stripe signature' }, 400);
    }

    let event: StripeEvent;
    try {
      event = JSON.parse(rawBody) as StripeEvent;
    } catch {
      return jsonResponse({ error: 'Invalid payload' }, 400);
    }

    const supabaseAdmin = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: insertEventError } = await supabaseAdmin.from('stripe_events').insert({
      event_id: event.id,
      event_type: event.type,
    });

    if (insertEventError?.code === '23505') {
      return jsonResponse({ received: true, duplicate: true });
    }
    if (insertEventError) {
      return jsonResponse({ error: 'Failed to persist event' }, 500);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await processCheckoutSessionCompleted(supabaseAdmin, event.data.object);
          break;
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          await processSubscriptionChanged(supabaseAdmin, event.data.object as StripeSubscriptionObject);
          break;
        default:
          break;
      }

      return jsonResponse({ received: true });
    } catch (error) {
      console.error('stripe-webhook processing failed:', error);
      await supabaseAdmin.from('stripe_events').delete().eq('event_id', event.id);
      return jsonResponse({ error: 'Webhook processing failed' }, 500);
    }
  } catch (error) {
    console.error('stripe-webhook failed:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
