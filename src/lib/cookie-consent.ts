'use client';

export const COOKIE_CONSENT_KEY = 'ff_cookie_consent_v1';
export const COOKIE_CONSENT_VERSION = 1 as const;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 180 days

export type CookieConsentState = {
  version: 1;
  necessary: true;
  analytics: boolean;
  updatedAt: string;
};

function isCookieConsentState(value: unknown): value is CookieConsentState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CookieConsentState>;
  return (
    candidate.version === 1 &&
    candidate.necessary === true &&
    typeof candidate.analytics === 'boolean' &&
    typeof candidate.updatedAt === 'string' &&
    !Number.isNaN(new Date(candidate.updatedAt).getTime())
  );
}

export function createCookieConsentState(analytics: boolean): CookieConsentState {
  return {
    version: COOKIE_CONSENT_VERSION,
    necessary: true,
    analytics,
    updatedAt: new Date().toISOString(),
  };
}

function parseRawCookieConsent(raw: string | null): CookieConsentState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return isCookieConsentState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = document.cookie.match(new RegExp(`(?:^|; )${escapedName}=([^;]*)`));
  return matcher ? decodeURIComponent(matcher[1]) : null;
}

function buildCookieWriteOptions() {
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  return `${isSecure ? '; Secure' : ''}; SameSite=Lax; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}`;
}

function writeCookieValue(name: string, rawValue: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(rawValue)}${buildCookieWriteOptions()}`;
}

function readConsentFromLocalStorage(): CookieConsentState | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(COOKIE_CONSENT_KEY);
  return parseRawCookieConsent(raw);
}

function readConsentFromCookie(): CookieConsentState | null {
  return parseRawCookieConsent(readCookieValue(COOKIE_CONSENT_KEY));
}

export function loadCookieConsentState(): CookieConsentState | null {
  const fromLocalStorage = readConsentFromLocalStorage();
  if (fromLocalStorage) return fromLocalStorage;
  return readConsentFromCookie();
}

export function persistCookieConsentState(state: CookieConsentState) {
  const raw = JSON.stringify(state);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, raw);
  }
  writeCookieValue(COOKIE_CONSENT_KEY, raw);
}

function clearCookieByName(name: string) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  const host = window.location.hostname;
  const domainCandidates = new Set<string | null>([null, host, `.${host}`]);

  const hostParts = host.split('.');
  if (hostParts.length >= 2 && host !== 'localhost') {
    const rootDomain = hostParts.slice(-2).join('.');
    domainCandidates.add(rootDomain);
    domainCandidates.add(`.${rootDomain}`);
  }

  domainCandidates.forEach((domain) => {
    const domainPart = domain ? `; domain=${domain}` : '';
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax${domainPart}`;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax${domainPart}`;
  });
}

export function clearGaCookies() {
  if (typeof document === 'undefined') return;

  const cookieNames = document.cookie
    .split(';')
    .map((entry) => entry.trim().split('=')[0])
    .filter(Boolean);

  const gaCookieNames = new Set<string>(['_ga', '_gid', '_gat']);
  cookieNames.forEach((name) => {
    if (name.startsWith('_ga_')) gaCookieNames.add(name);
  });

  gaCookieNames.forEach((name) => clearCookieByName(name));
}

export function setGaTrackingEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  const measurementId = (process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-YCCV3630X1').trim();
  if (!measurementId) return;
  const disableKey = `ga-disable-${measurementId}`;
  (window as unknown as Record<string, boolean>)[disableKey] = !enabled;
}

export function getInitialCookieConsentState() {
  return createCookieConsentState(false);
}
