import 'server-only';

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

type RateLimitBucket = {
  timestamps: number[];
};

const PRUNE_INTERVAL_MS = 5 * 60 * 1000;
let lastPrunedAt = 0;
const buckets = new Map<string, RateLimitBucket>();

const pruneExpiredBuckets = (now: number) => {
  if (now - lastPrunedAt < PRUNE_INTERVAL_MS) return;
  lastPrunedAt = now;

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.timestamps.length === 0 || bucket.timestamps[bucket.timestamps.length - 1] < now - PRUNE_INTERVAL_MS) {
      buckets.delete(key);
    }
  }
};

export const getRequestIp = (headers: Headers): string => {
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }

  const fallbackCandidates = [
    headers.get('x-real-ip'),
    headers.get('cf-connecting-ip'),
    headers.get('x-client-ip'),
  ];

  for (const candidate of fallbackCandidates) {
    const normalized = candidate?.trim();
    if (normalized) return normalized;
  }

  return 'unknown';
};

export const applyInMemoryRateLimit = (
  key: string,
  maxRequests: number,
  windowMs: number,
): RateLimitResult => {
  const now = Date.now();
  pruneExpiredBuckets(now);

  const bucket = buckets.get(key) || { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((timestamp) => now - timestamp < windowMs);

  if (bucket.timestamps.length >= maxRequests) {
    const oldestInWindow = bucket.timestamps[0] || now;
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - oldestInWindow)) / 1000));
    buckets.set(key, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - bucket.timestamps.length),
    retryAfterSeconds: 0,
  };
};
