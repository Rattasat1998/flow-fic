import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  COIN_PACKAGES,
  VIP_MONTHLY_PRICE_THB,
  VIP_PLAN_CODE,
  getCoinPackageById,
  getCoinPackageTotalCoins,
} from '../_shared/monetization.ts';
import {
  MONETIZATION_POLICY_VERSION,
  CHECKOUT_IDEMPOTENCY_WINDOW_MS,
  buildCheckoutRequestFingerprint,
  buildCoinPricingSnapshotId,
  buildVipPricingSnapshotId,
} from '../_shared/policy.ts';
import { createStripeCheckoutSession } from '../_shared/stripe.ts';

type CheckoutPayload = {
  kind: 'coins' | 'vip';
  packageId?: string;
  idempotencyKey?: string;
  paymentMethod?: 'card' | 'promptpay';
};

type StripeErrorResponse = {
  error?: {
    message?: string;
  };
};

type FinanceStatusRow = {
  finance_status: 'normal' | 'restricted_finance' | 'banned_finance';
  restriction_until: string | null;
};

type CheckoutRequestRow = {
  user_id: string;
  idempotency_key: string;
  request_fingerprint: string;
  status: string;
  checkout_session_id: string | null;
  checkout_url: string | null;
  policy_version: string;
  pricing_snapshot_id: string;
  request_id: string;
  created_at: string;
};

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:_-]{8,128}$/;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

function getSupabaseAnonKey() {
  const key = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!key) throw new Error('Missing SUPABASE_ANON_KEY');
  return key;
}

function getSupabaseServiceRoleKey() {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  return key;
}

function getAppOrigin(request: Request) {
  const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL');
  if (appUrl) return appUrl.replace(/\/+$/, '');

  const origin = request.headers.get('origin');
  if (origin) return origin.replace(/\/+$/, '');

  throw new Error('Missing NEXT_PUBLIC_APP_URL and request origin');
}

function getAccessToken(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const accessToken = authHeader.slice('Bearer '.length).trim();
  return accessToken || null;
}

function normalizeIdempotencyKey(raw: string | undefined): string | null {
  const key = (raw || '').trim();
  if (!key) return null;
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) return null;
  return key;
}

function isFinanceRestricted(row: FinanceStatusRow | null) {
  if (!row) return false;
  if (row.finance_status === 'banned_finance') return true;
  if (row.finance_status !== 'restricted_finance') return false;
  if (!row.restriction_until) return true;
  return new Date(row.restriction_until).getTime() > Date.now();
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return jsonResponse(
        { error: 'Unauthorized', code: 'MISSING_AUTHORIZATION_BEARER' },
        401
      );
    }

    const supabaseUrl = getSupabaseUrl();
    const supabaseAnonKey = getSupabaseAnonKey();
    const supabaseServiceRoleKey = getSupabaseServiceRoleKey();

    const supabasePublic = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await supabasePublic.auth.getUser(accessToken);

    if (userError || !user) {
      return jsonResponse(
        { error: 'Unauthorized', code: 'INVALID_OR_EXPIRED_ACCESS_TOKEN' },
        401
      );
    }

    const body = (await request.json()) as CheckoutPayload;
    if (body.kind !== 'coins' && body.kind !== 'vip') {
      return jsonResponse({ error: 'Invalid checkout type' }, 400);
    }
    if (body.paymentMethod && body.paymentMethod !== 'card' && body.paymentMethod !== 'promptpay') {
      return jsonResponse({ error: 'Invalid payment method' }, 400);
    }
    if (body.kind === 'vip' && body.paymentMethod === 'promptpay') {
      return jsonResponse({ error: 'PromptPay is available for coin top-up only' }, 400);
    }

    const coinPaymentMethod: 'card' | 'promptpay' =
      body.kind === 'coins' && body.paymentMethod === 'promptpay' ? 'promptpay' : 'card';

    const normalizedIdempotencyKey = normalizeIdempotencyKey(body.idempotencyKey);
    if (body.idempotencyKey && !normalizedIdempotencyKey) {
      return jsonResponse({ error: 'Invalid idempotency key format' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: financeStatusRow } = await supabaseAdmin
      .from('user_finance_statuses')
      .select('finance_status, restriction_until')
      .eq('user_id', user.id)
      .maybeSingle();

    if (financeStatusRow?.finance_status === 'banned_finance') {
      return jsonResponse({ error: 'Finance access banned', code: 'FINANCE_BANNED' }, 403);
    }

    if (isFinanceRestricted((financeStatusRow as FinanceStatusRow | null) || null)) {
      return jsonResponse({ error: 'Finance access temporarily restricted', code: 'FINANCE_RESTRICTED' }, 423);
    }

    const requestFingerprint = buildCheckoutRequestFingerprint({
      kind: body.kind,
      packageId: body.packageId || null,
      paymentMethod: body.kind === 'coins' ? coinPaymentMethod : null,
    });

    let priceMinor = 0;
    let coinAmount = 0;
    let pricingSnapshotId = '';

    if (body.kind === 'coins') {
      const pkg = body.packageId ? getCoinPackageById(body.packageId) : null;
      if (!pkg) {
        return jsonResponse({ error: 'Invalid coin package' }, 400);
      }

      priceMinor = pkg.priceThb * 100;
      coinAmount = getCoinPackageTotalCoins(pkg);
      pricingSnapshotId = buildCoinPricingSnapshotId({
        packageId: pkg.id,
        priceMinor,
        coinAmount,
      });
    } else {
      priceMinor = VIP_MONTHLY_PRICE_THB * 100;
      pricingSnapshotId = buildVipPricingSnapshotId({
        planCode: VIP_PLAN_CODE,
        priceMinor,
      });
    }

    let requestId = crypto.randomUUID();

    if (normalizedIdempotencyKey) {
      const nowIso = new Date().toISOString();

      const { error: reserveError } = await supabaseAdmin
        .from('payment_checkout_requests')
        .insert({
          user_id: user.id,
          idempotency_key: normalizedIdempotencyKey,
          kind: body.kind,
          package_id: body.packageId || null,
          request_fingerprint: requestFingerprint,
          status: 'pending',
          policy_version: MONETIZATION_POLICY_VERSION,
          pricing_snapshot_id: pricingSnapshotId,
          price_minor: priceMinor,
          coin_amount: coinAmount,
          request_id: requestId,
          created_at: nowIso,
          updated_at: nowIso,
        });

      if (reserveError?.code === '23505') {
        const { data: existingRow, error: existingError } = await supabaseAdmin
          .from('payment_checkout_requests')
          .select('user_id, idempotency_key, request_fingerprint, status, checkout_session_id, checkout_url, policy_version, pricing_snapshot_id, request_id, created_at')
          .eq('user_id', user.id)
          .eq('idempotency_key', normalizedIdempotencyKey)
          .maybeSingle();

        if (existingError) throw existingError;

        const existing = (existingRow as CheckoutRequestRow | null) || null;
        if (existing) {
          const ageMs = Date.now() - new Date(existing.created_at).getTime();
          const isInWindow = ageMs <= CHECKOUT_IDEMPOTENCY_WINDOW_MS;

          if (isInWindow && existing.request_fingerprint !== requestFingerprint) {
            return jsonResponse(
              {
                error: 'Idempotency key reuse with different payload',
                code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
              },
              409
            );
          }

          if (isInWindow && existing.checkout_url && existing.checkout_session_id) {
            return jsonResponse({
              checkoutUrl: existing.checkout_url,
              checkoutSessionId: existing.checkout_session_id,
              kind: body.kind,
              policyVersion: existing.policy_version,
              pricingSnapshotId: existing.pricing_snapshot_id,
              requestId: existing.request_id,
              availablePackages: body.kind === 'coins' ? COIN_PACKAGES : undefined,
              deduped: true,
            });
          }

          if (isInWindow && !existing.checkout_url && existing.status === 'pending') {
            return jsonResponse(
              {
                error: 'Idempotent request is still processing',
                code: 'IDEMPOTENCY_IN_PROGRESS',
                requestId: existing.request_id,
              },
              409
            );
          }

          requestId = crypto.randomUUID();
          const { error: resetError } = await supabaseAdmin
            .from('payment_checkout_requests')
            .update({
              kind: body.kind,
              package_id: body.packageId || null,
              request_fingerprint: requestFingerprint,
              status: 'pending',
              checkout_session_id: null,
              checkout_url: null,
              policy_version: MONETIZATION_POLICY_VERSION,
              pricing_snapshot_id: pricingSnapshotId,
              price_minor: priceMinor,
              coin_amount: coinAmount,
              request_id: requestId,
              created_at: nowIso,
              updated_at: nowIso,
            })
            .eq('user_id', user.id)
            .eq('idempotency_key', normalizedIdempotencyKey);

          if (resetError) throw resetError;
        }
      } else if (reserveError) {
        throw reserveError;
      }
    }

    const origin = getAppOrigin(request);
    const successUrl = `${origin}/pricing?checkout=success`;
    const cancelUrl = `${origin}/pricing?checkout=cancel`;

    const formData = new URLSearchParams();
    formData.set('success_url', successUrl);
    formData.set('cancel_url', cancelUrl);
    formData.set('client_reference_id', user.id);
    formData.set('metadata[user_id]', user.id);
    formData.set('metadata[kind]', body.kind);
    formData.set('metadata[policy_version]', MONETIZATION_POLICY_VERSION);
    formData.set('metadata[pricing_snapshot_id]', pricingSnapshotId);
    formData.set('metadata[request_id]', requestId);

    if (normalizedIdempotencyKey) {
      formData.set('metadata[idempotency_key]', normalizedIdempotencyKey);
    }

    if (body.kind === 'coins') {
      const pkg = body.packageId ? getCoinPackageById(body.packageId) : null;
      if (!pkg) {
        return jsonResponse({ error: 'Invalid coin package' }, 400);
      }

      formData.set('mode', 'payment');
      if (user.email) {
        formData.set('customer_email', user.email);
      }
      formData.set('metadata[coin_package_id]', pkg.id);
      formData.set('metadata[coin_amount]', String(getCoinPackageTotalCoins(pkg)));
      formData.set('metadata[price_minor]', String(pkg.priceThb * 100));
      formData.set('metadata[payment_method]', coinPaymentMethod);
      formData.set('payment_method_types[0]', coinPaymentMethod);
      formData.set('line_items[0][quantity]', '1');
      formData.set('line_items[0][price_data][currency]', 'thb');
      formData.set('line_items[0][price_data][unit_amount]', String(pkg.priceThb * 100));
      formData.set('line_items[0][price_data][product_data][name]', `${getCoinPackageTotalCoins(pkg)} Flow Coins`);
      formData.set(
        'line_items[0][price_data][product_data][description]',
        `Base ${pkg.coins} + bonus ${pkg.bonus} coins`
      );
    } else {
      const { data: entitlement } = await supabaseAdmin
        .from('vip_entitlements')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .maybeSingle();

      formData.set('mode', 'subscription');
      formData.set('metadata[plan_code]', VIP_PLAN_CODE);
      formData.set('metadata[price_minor]', String(VIP_MONTHLY_PRICE_THB * 100));
      formData.set('line_items[0][quantity]', '1');
      formData.set('line_items[0][price_data][currency]', 'thb');
      formData.set('line_items[0][price_data][unit_amount]', String(VIP_MONTHLY_PRICE_THB * 100));
      formData.set('line_items[0][price_data][recurring][interval]', 'month');
      formData.set('line_items[0][price_data][product_data][name]', 'FlowFic VIP Pass');
      formData.set('line_items[0][price_data][product_data][description]', 'Read premium coin-gated chapters without spending coins');
      formData.set('subscription_data[metadata][user_id]', user.id);
      formData.set('subscription_data[metadata][plan_code]', VIP_PLAN_CODE);
      formData.set('subscription_data[metadata][policy_version]', MONETIZATION_POLICY_VERSION);
      formData.set('subscription_data[metadata][pricing_snapshot_id]', pricingSnapshotId);
      formData.set('subscription_data[metadata][request_id]', requestId);

      if (entitlement?.stripe_customer_id) {
        formData.set('customer', entitlement.stripe_customer_id);
      } else if (user.email) {
        formData.set('customer_email', user.email);
      }
    }

    const stripeIdempotencyKey = normalizedIdempotencyKey
      ? `checkout:${user.id}:${normalizedIdempotencyKey}`
      : `checkout:${user.id}:${requestId}`;

    const stripeRes = await createStripeCheckoutSession(formData, stripeIdempotencyKey);
    if (!stripeRes.ok || !stripeRes.data.url) {
      const errorPayload = stripeRes.data as StripeErrorResponse;
      const stripeStatus =
        stripeRes.status >= 400 && stripeRes.status < 600 ? stripeRes.status : 502;
      const stripeMessage = errorPayload.error?.message || 'Failed to create checkout session';

      if (normalizedIdempotencyKey) {
        await supabaseAdmin
          .from('payment_checkout_requests')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('idempotency_key', normalizedIdempotencyKey);
      }

      console.error('Stripe checkout failed (Edge):', {
        stripeStatus,
        stripeMessage,
        kind: body.kind,
        packageId: body.packageId ?? null,
      });

      return jsonResponse({ error: stripeMessage, stripeStatus }, stripeStatus);
    }

    if (normalizedIdempotencyKey) {
      await supabaseAdmin
        .from('payment_checkout_requests')
        .update({
          status: 'created',
          checkout_session_id: stripeRes.data.id,
          checkout_url: stripeRes.data.url,
          policy_version: MONETIZATION_POLICY_VERSION,
          pricing_snapshot_id: pricingSnapshotId,
          request_id: requestId,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('idempotency_key', normalizedIdempotencyKey);
    }

    return jsonResponse({
      checkoutUrl: stripeRes.data.url,
      checkoutSessionId: stripeRes.data.id,
      kind: body.kind,
      policyVersion: MONETIZATION_POLICY_VERSION,
      pricingSnapshotId,
      requestId,
      availablePackages: body.kind === 'coins' ? COIN_PACKAGES : undefined,
    });
  } catch (error) {
    console.error('stripe-checkout failed:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonResponse({ error: message }, 500);
  }
});
