type StripeRequestOptions = {
  method?: 'GET' | 'POST';
  formData?: URLSearchParams;
};

type StripeApiResponse<T> = {
  ok: boolean;
  status: number;
  data: T;
};

type StripeCheckoutSessionResponse = {
  id: string;
  url: string | null;
};

type StripeSubscriptionResponse = {
  id: string;
  status: string;
  current_period_end: number;
  customer: string | null;
};

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

function getStripeSecretKey() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY');
  }
  return secretKey;
}

async function stripeRequest<T>(
  path: string,
  { method = 'POST', formData }: StripeRequestOptions = {}
): Promise<StripeApiResponse<T>> {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: method === 'POST' ? formData?.toString() : undefined,
    cache: 'no-store',
  });

  const data = (await response.json()) as T;
  return { ok: response.ok, status: response.status, data };
}

export async function createStripeCheckoutSession(formData: URLSearchParams) {
  return stripeRequest<StripeCheckoutSessionResponse>('/checkout/sessions', {
    method: 'POST',
    formData,
  });
}

export async function getStripeSubscription(subscriptionId: string) {
  return stripeRequest<StripeSubscriptionResponse>(`/subscriptions/${subscriptionId}`, {
    method: 'GET',
  });
}
