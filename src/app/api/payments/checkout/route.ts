import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  COIN_PACKAGES,
  VIP_MONTHLY_PRICE_THB,
  VIP_PLAN_CODE,
  getCoinPackageById,
  getCoinPackageTotalCoins,
} from '@/lib/monetization';
import { createStripeCheckoutSession } from '@/lib/server/stripe-api';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type CheckoutPayload = {
  kind: 'coins' | 'vip';
  packageId?: string;
};

type StripeErrorResponse = {
  error?: {
    message?: string;
  };
};

function getPublicSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getAuthenticatedUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const accessToken = authHeader.slice('Bearer '.length).trim();
  if (!accessToken) return null;

  const supabase = getPublicSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) return null;
  return user;
}

function getAppOrigin(request: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as CheckoutPayload;
    if (body.kind !== 'coins' && body.kind !== 'vip') {
      return NextResponse.json({ error: 'Invalid checkout type' }, { status: 400 });
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
        return NextResponse.json({ error: 'Invalid coin package' }, { status: 400 });
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
      const supabaseAdmin = getSupabaseAdmin();
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
      return NextResponse.json(
        { error: errorPayload.error?.message || 'Failed to create checkout session' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      checkoutUrl: stripeRes.data.url,
      checkoutSessionId: stripeRes.data.id,
      kind: body.kind,
      availablePackages: body.kind === 'coins' ? COIN_PACKAGES : undefined,
    });
  } catch (error) {
    console.error('Checkout creation failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
