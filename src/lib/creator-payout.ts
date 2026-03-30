export const CREATOR_BASE_RATE_SATANG_PER_COIN = 15;
export const CREATOR_SHARE_BPS = 7000;
export const CREATOR_HOLD_DAYS = 14;
export const CREATOR_MIN_PAYOUT_SATANG = 30000;
export const CREATOR_WITHHOLDING_BPS = 300;

export const CREATOR_PAYOUT_PROFILE_STATUSES = ['pending', 'verified', 'rejected'] as const;
export type CreatorPayoutProfileStatus = (typeof CREATOR_PAYOUT_PROFILE_STATUSES)[number];

export const CREATOR_REVENUE_EVENT_TYPES = [
  'unlock_credit',
  'chargeback_debit',
  'payout_reserve',
  'payout_release',
  'payout_paid',
  'debt_adjust',
] as const;
export type CreatorRevenueEventType = (typeof CREATOR_REVENUE_EVENT_TYPES)[number];

export const CREATOR_PAYOUT_REQUEST_STATUSES = [
  'requested',
  'approved',
  'paid',
  'rejected',
  'canceled',
] as const;
export type CreatorPayoutRequestStatus = (typeof CREATOR_PAYOUT_REQUEST_STATUSES)[number];

export type CreatorPayoutProfile = {
  writerUserId: string;
  legalName: string | null;
  promptpayTarget: string | null;
  kycStatus: CreatorPayoutProfileStatus;
  kycRejectionReason: string | null;
  verifiedAt: string | null;
  updatedAt: string;
};

export type CreatorBalance = {
  writerUserId: string;
  pendingSatang: number;
  availableSatang: number;
  reservedSatang: number;
  paidSatang: number;
  debtSatang: number;
  updatedAt: string;
};

export type CreatorPayoutRequest = {
  id: string;
  writerUserId: string;
  status: CreatorPayoutRequestStatus;
  grossSatang: number;
  withholdingBps: number;
  withholdingSatang: number;
  netSatang: number;
  promptpayTarget: string | null;
  transferReference: string | null;
  transferProofUrl: string | null;
  requestedAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
};

export type CreatorRevenueEvent = {
  id: string;
  writerUserId: string;
  readerUserId: string | null;
  eventType: CreatorRevenueEventType;
  coins: number;
  grossSatang: number;
  writerShareSatang: number;
  holdReleaseAt: string | null;
  createdAt: string;
};

export type CreatorStatementRow = {
  eventId: string;
  eventType: CreatorRevenueEventType;
  createdAt: string;
  storyId: string | null;
  chapterId: string | null;
  storyTitle: string | null;
  chapterTitle: string | null;
  readerUserId: string | null;
  coins: number;
  grossSatang: number;
  writerShareSatang: number;
};

export function satangToThb(satang: number) {
  return satang / 100;
}

export function computeWriterShareSatang(coins: number) {
  const grossSatang = Math.max(0, Math.floor(coins)) * CREATOR_BASE_RATE_SATANG_PER_COIN;
  const writerShareSatang = Math.floor((grossSatang * CREATOR_SHARE_BPS) / 10000);
  return { grossSatang, writerShareSatang };
}

export function computeWithholdingSatang(grossSatang: number) {
  const normalized = Math.max(0, Math.floor(grossSatang));
  return Math.floor((normalized * CREATOR_WITHHOLDING_BPS) / 10000);
}
