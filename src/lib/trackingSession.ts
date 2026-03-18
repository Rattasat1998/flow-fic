const SESSION_KEY = 'ff_session_id';
const SESSION_TS_KEY = 'ff_session_ts';
const SESSION_TTL_MS = 30 * 60 * 1000;

const createSessionId = (): string => `sess_${crypto.randomUUID()}`;

export const getOrCreateTrackingSessionId = (): string => {
    if (typeof window === 'undefined') return 'ssr';

    const now = Date.now();
    const existingId = localStorage.getItem(SESSION_KEY);
    const existingTsRaw = localStorage.getItem(SESSION_TS_KEY);
    const existingTs = existingTsRaw ? Number.parseInt(existingTsRaw, 10) : Number.NaN;

    if (existingId && Number.isFinite(existingTs) && now - existingTs < SESSION_TTL_MS) {
        localStorage.setItem(SESSION_TS_KEY, String(now));
        return existingId;
    }

    const nextSessionId = createSessionId();
    localStorage.setItem(SESSION_KEY, nextSessionId);
    localStorage.setItem(SESSION_TS_KEY, String(now));
    return nextSessionId;
};
