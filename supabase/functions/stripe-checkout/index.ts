import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  COIN_PACKAGES,
  VIP_MONTHLY_PRICE_THB,
  VIP_PLAN_CODE,
  getCoinPackageById,
  getCoinPackageTotalCoins,
} from '../_shared/monetization.ts';
import { createStripeCheckoutSession } from '../_shared/stripe.ts';

type CheckoutPayload = {
  kind: 'coins' | 'vip';
  packageId?: string;
};

type StripeErrorResponse = {
  error?: {
    message?: string;
  };
};

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
  if (appUrl) return appUrl;

  const origin = request.headers.get('origin');
  if (origin) return origin;

  throw new Error('Missing NEXT_PUBLIC_APP_URL and request origin');
}

function getAccessToken(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const accessToken = authHeader.slice('Bearer '.length).trim();
  return accessToken || null;
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
      return jsonResponse({ error: 'Unauthorized' }, 401);
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
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = (await request.json()) as CheckoutPayload;
    if (body.kind !== 'coins' && body.kind !== 'vip') {
      return jsonResponse({ error: 'Invalid checkout type' }, 400);
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

    if (body.kind === 'coins') {
      const pkg = body.packageId ? getCoinPackageById(body.packageId) : null;
      if (!pkg) {
        return jsonResponse({ error: 'Invalid coin package' }, 400);
      }

      formData.set('mode', 'payment');
      formData.set('metadata[coin_package_id]', pkg.id);
      formData.set('metadata[coin_amount]', String(getCoinPackageTotalCoins(pkg)));
      formData.set('payment_method_types[0]', 'card');
      formData.set('line_items[0][quantity]', '1');
      formData.set('line_items[0][price_data][currency]', 'thb');
      formData.set('line_items[0][price_data][unit_amount]', String(pkg.priceThb * 100));
      formData.set('line_items[0][price_data][product_data][name]', `${getCoinPackageTotalCoins(pkg)} Flow Coins`);
      formData.set(
        'line_items[0][price_data][product_data][description]',
        `Base ${pkg.coins} + bonus ${pkg.bonus} coins`
      );
    } else {
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: entitlement } = await supabaseAdmin
        .from('vip_entitlements')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .maybeSingle();

      formData.set('mode', 'subscription');
      formData.set('metadata[plan_code]', VIP_PLAN_CODE);
      formData.set('line_items[0][quantity]', '1');
      formData.set('line_items[0][price_data][currency]', 'thb');
      formData.set('line_items[0][price_data][unit_amount]', String(VIP_MONTHLY_PRICE_THB * 100));
      formData.set('line_items[0][price_data][recurring][interval]', 'month');
      formData.set('line_items[0][price_data][product_data][name]', 'FlowFic VIP Pass');
      formData.set('line_items[0][price_data][product_data][description]', 'Unlimited AI chat and premium perks');
      formData.set('subscription_data[metadata][user_id]', user.id);
      formData.set('subscription_data[metadata][plan_code]', VIP_PLAN_CODE);

      if (entitlement?.stripe_customer_id) {
        formData.set('customer', entitlement.stripe_customer_id);
      } else if (user.email) {
        formData.set('customer_email', user.email);
      }
    }

    const stripeRes = await createStripeCheckoutSession(formData);
    if (!stripeRes.ok || !stripeRes.data.url) {
      const errorPayload = stripeRes.data as StripeErrorResponse;
      return jsonResponse(
        { error: errorPayload.error?.message || 'Failed to create checkout session' },
        502
      );
    }

    return jsonResponse({
      checkoutUrl: stripeRes.data.url,
      checkoutSessionId: stripeRes.data.id,
      kind: body.kind,
      availablePackages: body.kind === 'coins' ? COIN_PACKAGES : undefined,
    });
  } catch (error) {
    console.error('stripe-checkout failed:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
