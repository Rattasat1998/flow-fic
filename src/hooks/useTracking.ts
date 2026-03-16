'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────
export interface TrackingMetadata {
    referrer?: string;
    search_query?: string;
    category_filter?: string;
    sub_category_filter?: string;
    focus_core?: boolean;
    tab?: string;
    coin_price?: number;
    from_chapter_id?: string;
    to_chapter_id?: string;
    choice_id?: string;
    selection_mode?: 'manual' | 'timeout_auto';
    countdown_seconds?: number;
    method?: string;
    duration_ms?: number;
    scroll_depth?: number;
    device?: string;
    viewport_width?: number;
    [key: string]: unknown;
}

export type EventType =
    | 'page_view'
    | 'story_view'
    | 'chapter_read'
    | 'pricing_view'
    | 'chapter_unlock'
    | 'choice_select'
    | 'like'
    | 'favorite'
    | 'comment';

// ─── Session management ────────────────────────────────
const SESSION_KEY = 'ff_session_id';
const SESSION_TS_KEY = 'ff_session_ts';
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

function generateSessionId(): string {
    return 'sess_' + crypto.randomUUID();
}

function getOrCreateSessionId(): string {
    if (typeof window === 'undefined') return 'ssr';

    const now = Date.now();
    const existingId = localStorage.getItem(SESSION_KEY);
    const existingTs = localStorage.getItem(SESSION_TS_KEY);

    // Reuse session if within TTL
    if (existingId && existingTs) {
        const elapsed = now - parseInt(existingTs, 10);
        if (elapsed < SESSION_TTL_MS) {
            // Refresh timestamp on activity
            localStorage.setItem(SESSION_TS_KEY, String(now));
            return existingId;
        }
    }

    // Create new session
    const newId = generateSessionId();
    localStorage.setItem(SESSION_KEY, newId);
    localStorage.setItem(SESSION_TS_KEY, String(now));
    return newId;
}

// ─── Device metadata helper ────────────────────────────
function getDeviceMeta(): Pick<TrackingMetadata, 'device' | 'viewport_width' | 'referrer'> {
    if (typeof window === 'undefined') return {};
    const ua = navigator.userAgent;
    let device: string = 'desktop';
    if (/Mobi|Android/i.test(ua)) device = 'mobile';
    else if (/Tablet|iPad/i.test(ua)) device = 'tablet';

    return {
        device,
        viewport_width: window.innerWidth,
        referrer: document.referrer || undefined,
    };
}

// ─── Hook ──────────────────────────────────────────────
interface UseTrackingOptions {
    /** Auto-fire a page_view event on mount */
    autoPageView?: boolean;
    /** Page path for auto page_view */
    pagePath?: string;
    /** Story ID context */
    storyId?: string;
    /** Chapter ID context */
    chapterId?: string;
    /** Extra metadata for auto page_view */
    autoMeta?: TrackingMetadata;
}

export function useTracking(options: UseTrackingOptions = {}) {
    const { user } = useAuth();
    const userId = user?.id ?? null;
    const sessionIdRef = useRef<string>('ssr');
    const mountTimeRef = useRef<number>(0);
    const hasFiredPageView = useRef(false);

    // Initialize session id on client
    useEffect(() => {
        mountTimeRef.current = Date.now();
        sessionIdRef.current = getOrCreateSessionId();
    }, []);

    // Core tracking function — fire-and-forget
    const trackEvent = useCallback(
        (
            eventType: EventType,
            pagePath: string,
            extra?: {
                storyId?: string;
                chapterId?: string;
                metadata?: TrackingMetadata;
            }
        ) => {
            const sessionId = sessionIdRef.current;
            if (sessionId === 'ssr') return; // skip SSR

            const deviceMeta = getDeviceMeta();
            const mergedMeta = { ...deviceMeta, ...(extra?.metadata || {}) };

            supabase
                .from('page_events')
                .insert({
                    user_id: userId,
                    session_id: sessionId,
                    event_type: eventType,
                    page_path: pagePath,
                    story_id: extra?.storyId || null,
                    chapter_id: extra?.chapterId || null,
                    metadata: mergedMeta,
                })
                .then(({ error }) => {
                    if (error) {
                        console.warn('[Tracking] Failed to insert event:', error.message);
                    }
                });
        },
        [userId]
    );

    // Auto page_view on mount
    useEffect(() => {
        if (options.autoPageView && options.pagePath && !hasFiredPageView.current) {
            hasFiredPageView.current = true;
            trackEvent(
                options.storyId ? 'story_view' : options.chapterId ? 'chapter_read' : 'page_view',
                options.pagePath,
                {
                    storyId: options.storyId,
                    chapterId: options.chapterId,
                    metadata: options.autoMeta,
                }
            );
        }
    }, [options.autoPageView, options.pagePath, options.storyId, options.chapterId, options.autoMeta, trackEvent]);

    // Track time spent when leaving page
    useEffect(() => {
        if (!options.pagePath) return;

        const handleUnload = () => {
            const durationMs = Date.now() - mountTimeRef.current;
            if (durationMs < 1000) return; // ignore very short visits

            // Use sendBeacon for reliable delivery on page unload
            const payload = {
                user_id: userId,
                session_id: sessionIdRef.current,
                event_type: 'page_leave' as const,
                page_path: options.pagePath,
                story_id: options.storyId || null,
                chapter_id: options.chapterId || null,
                metadata: { duration_ms: durationMs },
            };

            // sendBeacon with Supabase REST API
            const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/page_events`;
            const headers = {
                'Content-Type': 'application/json',
                apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
                Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''}`,
            };

            try {
                const beaconHeaders = new Headers(headers);
                // sendBeacon doesn't support custom headers, so fall back to fetch keepalive
                fetch(url, {
                    method: 'POST',
                    headers: beaconHeaders,
                    body: JSON.stringify(payload),
                    keepalive: true,
                }).catch(() => { });
            } catch {
                // silently fail
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') handleUnload();
        };

        window.addEventListener('beforeunload', handleUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('beforeunload', handleUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [options.pagePath, options.storyId, options.chapterId, userId]);

    return {
        trackEvent,
    };
}
