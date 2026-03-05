export const MONETIZATION_POLICY_VERSION = 'v1';

export const CHECKOUT_IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

export const FINANCE_STATUSES = ['normal', 'restricted_finance', 'banned_finance'] as const;

export type FinanceStatus = (typeof FINANCE_STATUSES)[number];

export function buildCoinPricingSnapshotId(params: {
  packageId: string;
  priceMinor: number;
  coinAmount: number;
}) {
  return `coins:${params.packageId}:thb:${params.priceMinor}:${params.coinAmount}:${MONETIZATION_POLICY_VERSION}`;
}

export function buildVipPricingSnapshotId(params: { planCode: string; priceMinor: number }) {
  return `vip:${params.planCode}:thb:${params.priceMinor}:${MONETIZATION_POLICY_VERSION}`;
}

export function buildCheckoutRequestFingerprint(params: {
  kind: 'coins' | 'vip';
  packageId?: string | null;
}) {
  return `${params.kind}:${params.packageId || ''}`;
}
