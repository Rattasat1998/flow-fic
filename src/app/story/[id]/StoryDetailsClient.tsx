'use client';

import { useState, useEffect, useCallback, useLayoutEffect, useMemo, useRef, type FormEvent, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { FEATURE_FLAGS } from '@/lib/featureFlags';
import {
    PlaySquare,
    UserPlus,
    UserCheck,
    Coins,
    Bookmark,
    ChevronRight,
    Lock,
    X,
} from 'lucide-react';
import styles from './details.module.css';
import { useTracking } from '@/hooks/useTracking';
import { useFollow } from '@/hooks/useFollow';
import { useAuth } from '@/contexts/AuthContext';
import { StorySearchPanel } from '@/components/navigation/StorySearchPanel';
import { ShareButton } from '@/components/share/ShareButton';
import { SharedNavbar } from '@/components/navigation/SharedNavbar';
import {
    deriveReaderCtaState,
    mergeStoredStoryProgress,
    normalizeStoredStoryProgress,
    normalizeStoryProgressVersionValue,
    readStoredStoryProgress,
    type ReaderProgressRow,
    type StoredStoryProgress,
    writeStoredStoryProgress,
} from '@/lib/readerProgress';
import type { DiscoveryResponse, DiscoveryStory } from '@/types/discovery';

interface StoryDetailsClientProps {
    storyId: string;
}

type DBStory = {
    id: string;
    title: string;
    pen_name: string;
    category: string;
    path_mode: 'linear' | 'branching';
    entry_chapter_id: string | null;
    synopsis: string;
    cover_url: string | null;
    cover_wide_url: string | null;
    status: string;
    completion_status: string;
    created_at: string;
    user_id: string;
};

type DBChapter = {
    id: string;
    title: string;
    order_index: number;
    read_count: number;
    created_at: string;
    is_premium: boolean;
    coin_price: number;
    can_read: boolean;
    access_source: string;
};

type ReaderChapterRow = {
    id: string;
    title: string | null;
    order_index: number;
    read_count: number;
    created_at: string | null;
    is_premium: boolean;
    coin_price: number;
    can_read: boolean;
    access_source: string;
};

type StoryCharacter = {
    id: string;
    name: string;
    age: string | null;
    occupation: string | null;
    image_url: string | null;
};

type RelatedStoryRow = {
    id: string;
    title: string;
    pen_name: string | null;
    category: string | null;
    completion_status: string | null;
    cover_url: string | null;
    cover_wide_url: string | null;
    read_count: number | null;
    created_at: string | null;
};

type RelatedStory = {
    id: string;
    title: string;
    penName: string;
    categoryLabel: string;
    completionLabel: string;
    cover: string;
    readCount: number;
    createdAt: string;
};

type StoryDetailCacheEntry = {
    story: DBStory;
    chapters: DBChapter[];
    storyCharacters: StoryCharacter[];
    relatedStories: RelatedStory[];
    likeCount: number;
    coinBalance: number;
    followerCount: number;
    isFollowing: boolean;
    updatedAt: string;
};

const fallbackCover = 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=600&q=80';
const fallbackPromoCover = 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1200&q=80';
const BRANCHING_FEATURE_ENABLED = FEATURE_FLAGS.branching;
const STORY_DETAIL_CACHE_PREFIX = 'flowfic:story-detail';
const STORY_DETAIL_RETURN_CACHE_PREFIX = 'flowfic:story-detail:return';
const STORY_DETAIL_RETURN_STATE_PREFIX = 'flowfic:story-detail:return-state';
const STORY_DETAIL_SCROLL_PREFIX = 'flowfic:story-detail-scroll';
const useClientLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const getStoryDetailCacheKey = (storyId: string, userId?: string | null) =>
    `${STORY_DETAIL_CACHE_PREFIX}:${userId || 'guest'}:${storyId}`;

const getStoryDetailReturnCacheKey = (storyId: string) =>
    `${STORY_DETAIL_RETURN_CACHE_PREFIX}:${storyId}`;

const getStoryDetailReturnStateKey = (storyId: string) =>
    `${STORY_DETAIL_RETURN_STATE_PREFIX}:${storyId}`;

const getStoryDetailScrollKey = (storyId: string, userId?: string | null) =>
    `${STORY_DETAIL_SCROLL_PREFIX}:${userId || 'guest'}:${storyId}`;

const getClientNavigationType = (): PerformanceNavigationTiming['type'] | 'navigate' => {
    if (typeof window === 'undefined' || typeof performance === 'undefined') return 'navigate';

    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (
        entry?.type === 'reload'
        || entry?.type === 'back_forward'
        || entry?.type === 'prerender'
        || entry?.type === 'navigate'
    ) {
        return entry.type;
    }

    return 'navigate';
};

const isStoryNotFoundError = (error: { code?: string } | null | undefined): boolean => {
    return error?.code === 'PGRST116';
};

const resolveStoryTypeLabel = (category: string | null | undefined): string => {
    if (category === 'fanfic') return 'แฟนฟิก';
    return 'ออริจินัล';
};

const resolveCompletionLabel = (completionStatus: string | null | undefined): string => {
    return completionStatus === 'completed' ? 'จบแล้ว' : 'กำลังอัปเดต';
};

const STORY_SEARCH_PANEL_LIMIT = 8;

const compareSearchStoriesByPriority = (a: DiscoveryStory, b: DiscoveryStory): number => {
    if (b.score_7d !== a.score_7d) return b.score_7d - a.score_7d;
    if (b.total_view_count !== a.total_view_count) return b.total_view_count - a.total_view_count;

    const createdAtA = a.created_at ? Date.parse(a.created_at) : 0;
    const createdAtB = b.created_at ? Date.parse(b.created_at) : 0;
    const safeCreatedAtA = Number.isNaN(createdAtA) ? 0 : createdAtA;
    const safeCreatedAtB = Number.isNaN(createdAtB) ? 0 : createdAtB;
    return safeCreatedAtB - safeCreatedAtA;
};

const buildStorySearchPanelQuery = (query: string): string => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    params.set('focusCore', 'false');
    params.set('limit', String(STORY_SEARCH_PANEL_LIMIT));
    return params.toString();
};

const collectStorySearchPanelStories = (payload: DiscoveryResponse, currentStoryId: string): DiscoveryStory[] => {
    const uniqueStories = new Map<string, DiscoveryStory>();
    [...payload.rails.trending.items, ...payload.rails.popular.items, ...payload.rails.new.items].forEach((story) => {
        if (story.id === currentStoryId) return;
        if (!uniqueStories.has(story.id)) uniqueStories.set(story.id, story);
    });

    return Array.from(uniqueStories.values())
        .sort(compareSearchStoriesByPriority)
        .slice(0, STORY_SEARCH_PANEL_LIMIT);
};

const formatThaiDate = (value: string): string => {
    return new Date(value).toLocaleDateString('th-TH', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
};

const parseStoryDetailCache = (raw: string | null): StoryDetailCacheEntry | null => {
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as Partial<StoryDetailCacheEntry>;
        if (!parsed || typeof parsed !== 'object' || !parsed.story || !Array.isArray(parsed.chapters)) {
            return null;
        }

        return {
            story: parsed.story as DBStory,
            chapters: parsed.chapters as DBChapter[],
            storyCharacters: Array.isArray(parsed.storyCharacters)
                ? parsed.storyCharacters as StoryCharacter[]
                : [],
            relatedStories: Array.isArray(parsed.relatedStories)
                ? parsed.relatedStories as RelatedStory[]
                : [],
            likeCount: Number.isFinite(parsed.likeCount) ? Number(parsed.likeCount) : 0,
            coinBalance: Number.isFinite(parsed.coinBalance) ? Number(parsed.coinBalance) : 0,
            followerCount: Number.isFinite(parsed.followerCount) ? Number(parsed.followerCount) : 0,
            isFollowing: !!parsed.isFollowing,
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
        };
    } catch {
        return null;
    }
};

const readStoryDetailCache = (storyId: string, userId?: string | null): StoryDetailCacheEntry | null => {
    if (typeof window === 'undefined') return null;

    try {
        return parseStoryDetailCache(sessionStorage.getItem(getStoryDetailCacheKey(storyId, userId)));
    } catch {
        return null;
    }
};

const readStoryDetailReturnCache = (storyId: string): StoryDetailCacheEntry | null => {
    if (typeof window === 'undefined') return null;

    try {
        return parseStoryDetailCache(sessionStorage.getItem(getStoryDetailReturnCacheKey(storyId)));
    } catch {
        return null;
    }
};

const writeStoryDetailCache = (storyId: string, userId: string | null | undefined, cache: StoryDetailCacheEntry) => {
    if (typeof window === 'undefined') return;

    try {
        sessionStorage.setItem(getStoryDetailCacheKey(storyId, userId), JSON.stringify(cache));
        sessionStorage.setItem(getStoryDetailReturnCacheKey(storyId), JSON.stringify(cache));
    } catch {
        // Ignore storage quota / private mode failures
    }
};

const markStoryDetailReturnState = (storyId: string) => {
    if (typeof window === 'undefined') return;

    try {
        sessionStorage.setItem(getStoryDetailReturnStateKey(storyId), new Date().toISOString());
    } catch {
        // Ignore storage failures
    }
};

const consumeStoryDetailReturnState = (storyId: string): boolean => {
    if (typeof window === 'undefined') return false;

    try {
        const key = getStoryDetailReturnStateKey(storyId);
        const hasValue = !!sessionStorage.getItem(key);
        if (hasValue) {
            sessionStorage.removeItem(key);
        }
        return hasValue;
    } catch {
        return false;
    }
};

export default function StoryDetailsClient({ storyId }: StoryDetailsClientProps) {
    const router = useRouter();

    useTracking({ autoPageView: true, pagePath: `/story/${storyId}`, storyId });
    const {
        user,
        isLoading: isLoadingAuth,
        signInWithGoogle,
        signInWithFacebook,
        signOut,
    } = useAuth();
    const userId = user?.id ?? null;
    const detailCacheKey = useMemo(() => getStoryDetailCacheKey(storyId, userId), [storyId, userId]);
    const detailScrollKey = useMemo(() => getStoryDetailScrollKey(storyId, userId), [storyId, userId]);
    const navigationType = useMemo(() => getClientNavigationType(), []);

    const [isLoading, setIsLoading] = useState(true);
    const [dbStory, setDbStory] = useState<DBStory | null>(null);
    const [dbChapters, setDbChapters] = useState<DBChapter[]>([]);
    const [storyCharacters, setStoryCharacters] = useState<StoryCharacter[]>([]);
    const [relatedStories, setRelatedStories] = useState<RelatedStory[]>([]);
    const [likeCount, setLikeCount] = useState(0);
    const [loadError, setLoadError] = useState('');
    const [hydratedCache, setHydratedCache] = useState<StoryDetailCacheEntry | null>(null);
    const hasRestoredScrollRef = useRef(false);
    const hasConsumedReturnIntentRef = useRef(false);
    const isReturnNavigationRef = useRef(false);
    const profileMenuRef = useRef<HTMLDivElement | null>(null);

    // Coin dialog state
    const [coinBalance, setCoinBalance] = useState(0);
    const [unlockConfirmChapter, setUnlockConfirmChapter] = useState<{
        id: string;
        title: string;
        coinPrice: number;
        index: number;
    } | null>(null);
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [unlockError, setUnlockError] = useState<string | null>(null);
    const [coinToast, setCoinToast] = useState<{ coins: number; balance: number } | null>(null);
    const [readerProgress, setReaderProgress] = useState<StoredStoryProgress | null>(null);
    const [storyProgressVersion, setStoryProgressVersion] = useState<string | null>(null);
    const [isChapterListExpanded, setIsChapterListExpanded] = useState(false);
    const [topSearchInput, setTopSearchInput] = useState('');
    const [topSearchStories, setTopSearchStories] = useState<DiscoveryStory[]>([]);
    const [isTopSearchLoading, setIsTopSearchLoading] = useState(false);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
    const [isAuthActionLoading, setIsAuthActionLoading] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);
    const [unreadNotifCount, setUnreadNotifCount] = useState(0);

    const { isFollowing, followerCount, toggleFollow, isLoading: isFollowLoading } = useFollow({
        storyId,
        userId: user?.id,
        initialFollowerCount: hydratedCache?.followerCount,
        initialIsFollowing: hydratedCache?.isFollowing,
    });

    const effectiveFollowerCount = isFollowLoading && hydratedCache
        ? hydratedCache.followerCount
        : followerCount;
    const effectiveIsFollowing = isFollowLoading && hydratedCache
        ? hydratedCache.isFollowing
        : isFollowing;
    const hasHydratedCache = hydratedCache !== null;
    const cachedFollowerCount = hydratedCache?.followerCount ?? 0;
    const cachedIsFollowing = hydratedCache?.isFollowing ?? false;
    const isBackForwardNavigation = navigationType === 'back_forward';
    const hasRenderableSnapshot = hasHydratedCache || dbStory !== null;

    useEffect(() => {
        hasConsumedReturnIntentRef.current = false;
        isReturnNavigationRef.current = false;
    }, [storyId]);

    useClientLayoutEffect(() => {
        setReaderProgress(readStoredStoryProgress(storyId, userId));
    }, [storyId, userId]);

    useClientLayoutEffect(() => {
        hasRestoredScrollRef.current = false;
        setLoadError('');

        if (!hasConsumedReturnIntentRef.current) {
            hasConsumedReturnIntentRef.current = true;
            isReturnNavigationRef.current = consumeStoryDetailReturnState(storyId);
        }

        const fallbackCached = isReturnNavigationRef.current || isBackForwardNavigation
            ? readStoryDetailReturnCache(storyId)
            : null;
        if (isLoadingAuth) {
            if (!fallbackCached) return;

            setHydratedCache(fallbackCached);
            setDbStory(fallbackCached.story);
            setDbChapters(fallbackCached.chapters);
            setStoryCharacters(fallbackCached.storyCharacters);
            setRelatedStories(fallbackCached.relatedStories);
            setLikeCount(fallbackCached.likeCount);
            setCoinBalance(fallbackCached.coinBalance);
            setIsLoading(false);
            return;
        }

        const cached = readStoryDetailCache(storyId, userId) || fallbackCached;
        if (cached) {
            setHydratedCache(cached);
            setDbStory(cached.story);
            setDbChapters(cached.chapters);
            setStoryCharacters(cached.storyCharacters);
            setRelatedStories(cached.relatedStories);
            setLikeCount(cached.likeCount);
            setCoinBalance(cached.coinBalance);
            setIsLoading(false);
            return;
        }

        if (hasRenderableSnapshot) {
            setIsLoading(false);
            return;
        }

        setHydratedCache(null);
        setDbStory(null);
        setDbChapters([]);
        setStoryCharacters([]);
        setRelatedStories([]);
        setLikeCount(0);
        setCoinBalance(0);
        setIsLoading(true);
    }, [detailCacheKey, hasRenderableSnapshot, isBackForwardNavigation, isLoadingAuth, storyId, userId]);

    const persistStoryDetailSnapshot = useCallback(() => {
        if (!dbStory) return;

        const nextCache: StoryDetailCacheEntry = {
            story: dbStory,
            chapters: dbChapters,
            storyCharacters,
            relatedStories,
            likeCount,
            coinBalance,
            followerCount: effectiveFollowerCount,
            isFollowing: effectiveIsFollowing,
            updatedAt: new Date().toISOString(),
        };

        writeStoryDetailCache(storyId, userId, nextCache);
    }, [
        dbStory,
        dbChapters,
        storyCharacters,
        relatedStories,
        likeCount,
        coinBalance,
        effectiveFollowerCount,
        effectiveIsFollowing,
        storyId,
        userId,
    ]);

    const saveStoryDetailScrollPosition = useCallback(() => {
        if (typeof window === 'undefined') return;

        try {
            sessionStorage.setItem(detailScrollKey, String(window.scrollY));
        } catch {
            // Ignore storage failures
        }
    }, [detailScrollKey]);

    const persistStoryDetailReturnState = useCallback(() => {
        persistStoryDetailSnapshot();
        saveStoryDetailScrollPosition();
        markStoryDetailReturnState(storyId);
    }, [persistStoryDetailSnapshot, saveStoryDetailScrollPosition, storyId]);

    useEffect(() => {
        if (!dbStory) return;
        persistStoryDetailSnapshot();
    }, [dbStory, persistStoryDetailSnapshot]);

    useEffect(() => {
        const handlePageHide = () => {
            persistStoryDetailReturnState();
        };

        window.addEventListener('pagehide', handlePageHide);
        return () => window.removeEventListener('pagehide', handlePageHide);
    }, [persistStoryDetailReturnState]);

    useEffect(() => {
        if (isLoadingAuth || isLoading || !dbStory || hasRestoredScrollRef.current) return;

        const rawScroll = sessionStorage.getItem(detailScrollKey);
        hasRestoredScrollRef.current = true;

        if (!rawScroll) return;

        const scrollTop = Number(rawScroll);
        sessionStorage.removeItem(detailScrollKey);

        if (!Number.isFinite(scrollTop) || scrollTop <= 0) return;

        let cancelled = false;
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                if (cancelled) return;
                window.scrollTo({ top: scrollTop, behavior: 'auto' });
            });
        });

        return () => {
            cancelled = true;
        };
    }, [detailScrollKey, isLoadingAuth, isLoading, dbStory]);

    useEffect(() => {
        if (isLoadingAuth) return;

        let cancelled = false;
        let rafId: number | null = null;
        let timeoutId: number | null = null;

        const fetchStoryDetails = async () => {
            const hasCachedSnapshot = hasHydratedCache;
            const shouldSilentRevalidate = hasCachedSnapshot || isBackForwardNavigation;
            const localStoredProgress = readStoredStoryProgress(storyId, userId);

            if (!shouldSilentRevalidate) {
                setIsLoading(true);
            }
            setLoadError('');
            setStoryProgressVersion(null);
            setReaderProgress(localStoredProgress);

            const { data: storyData, error: storyError } = await supabase
                .from('stories')
                .select('*')
                .eq('id', storyId)
                .eq('status', 'published')
                .single();

            if (cancelled) return;

            if (storyError || !storyData) {
                if (hasCachedSnapshot && !isStoryNotFoundError(storyError)) {
                    setIsLoading(false);
                    return;
                }

                setHydratedCache(null);
                setDbStory(null);
                setDbChapters([]);
                setStoryCharacters([]);
                setRelatedStories([]);
                setLikeCount(0);
                setCoinBalance(0);
                setLoadError(isStoryNotFoundError(storyError) || !storyData ? 'ไม่พบข้อมูลเรื่อง' : 'ไม่สามารถโหลดข้อมูลเรื่องนี้ได้');
                setIsLoading(false);
                return;
            }

            const { data: chapterRows, error: chapterRowsError } = await supabase.rpc('get_reader_chapters', {
                p_story_id: storyId,
                p_preview_mode: false,
                p_preview_chapter_id: null,
            });

            if (cancelled) return;

            if (chapterRowsError) {
                if (!hasCachedSnapshot) {
                    setLoadError('ไม่สามารถโหลดข้อมูลตอนของเรื่องนี้ได้');
                    setIsLoading(false);
                }
                return;
            }

            const { data: characterRows } = await supabase
                .from('characters')
                .select('id, name, age, occupation, image_url')
                .eq('story_id', storyId)
                .order('order_index', { ascending: true });

            const { data: relatedStoryRows, error: relatedStoryError } = await supabase
                .from('stories')
                .select('id, title, pen_name, category, completion_status, cover_url, cover_wide_url, read_count, created_at')
                .eq('user_id', storyData.user_id)
                .eq('status', 'published')
                .neq('id', storyId)
                .order('read_count', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(3);
            if (relatedStoryError) {
                console.warn('[StoryDetail] Failed to fetch related stories:', relatedStoryError);
            }

            const { data: storyProgressVersionData } = await supabase.rpc('get_story_progress_version', {
                p_story_id: storyId,
            });

            const chapterData = ((chapterRows as ReaderChapterRow[] | null) || []).map((chapter) => ({
                id: chapter.id,
                title: chapter.title || 'ไม่มีชื่อ',
                order_index: chapter.order_index,
                read_count: chapter.read_count || 0,
                created_at: chapter.created_at || new Date(0).toISOString(),
                is_premium: !!chapter.is_premium,
                coin_price: Math.max(0, chapter.coin_price || 0),
                can_read: !!chapter.can_read,
                access_source: chapter.access_source || 'free',
            }));

            // Fetch like count
            const { count: likesCount } = await supabase
                .from('likes')
                .select('*', { count: 'exact', head: true })
                .eq('story_id', storyId);

            // Fetch wallet + unlock records
            let nextCoinBalance = 0;
            let remoteProgress: StoredStoryProgress | null = null;
            if (userId) {
                const [{ data: walletData }, { data: unlockRows }, { data: progressRow }] = await Promise.all([
                    supabase
                        .from('wallets')
                        .select('coin_balance')
                        .eq('user_id', userId)
                        .maybeSingle(),
                    supabase
                        .from('chapter_unlocks')
                        .select('chapter_id')
                        .eq('user_id', userId)
                        .eq('story_id', storyId),
                    supabase
                        .from('reader_progress')
                        .select('last_chapter_id, last_chapter_index, chapter_states, updated_at, completed_at, completed_chapter_id, completed_story_version')
                        .eq('user_id', userId)
                        .eq('story_id', storyId)
                        .maybeSingle(),
                ]);

                nextCoinBalance = walletData?.coin_balance || 0;
                if (progressRow) {
                    remoteProgress = normalizeStoredStoryProgress(progressRow as ReaderProgressRow);
                }

                const unlockedIds = new Set((unlockRows || []).map((r: { chapter_id: string }) => r.chapter_id));

                // Override access_source for chapters that have been unlocked by paying
                chapterData.forEach((ch) => {
                    if (unlockedIds.has(ch.id)) {
                        ch.can_read = true;
                        ch.access_source = 'unlock';
                    }
                });
            }
            if (cancelled) return;
            setCoinBalance(nextCoinBalance);

            const mergedProgress = mergeStoredStoryProgress(localStoredProgress, remoteProgress);
            if (mergedProgress) {
                writeStoredStoryProgress(storyId, userId, mergedProgress);
            }
            setReaderProgress(mergedProgress);
            setStoryProgressVersion(normalizeStoryProgressVersionValue(storyProgressVersionData));

            const nextStory = storyData as DBStory;
            const nextChapters = chapterData as DBChapter[] || [];
            const nextCharacters = ((characterRows as StoryCharacter[] | null) || []).filter((character) => character.name.trim().length > 0);
            const nextRelatedStories = ((relatedStoryRows as RelatedStoryRow[] | null) || []).map((story) => ({
                id: story.id,
                title: story.title || 'ไม่มีชื่อเรื่อง',
                penName: story.pen_name?.trim() || nextStory.pen_name,
                categoryLabel: resolveStoryTypeLabel(story.category),
                completionLabel: resolveCompletionLabel(story.completion_status),
                cover: story.cover_url || story.cover_wide_url || fallbackCover,
                readCount: story.read_count || 0,
                createdAt: story.created_at || new Date(0).toISOString(),
            }));
            const nextLikeCount = likesCount || 0;
            const nextCache: StoryDetailCacheEntry = {
                story: nextStory,
                chapters: nextChapters,
                storyCharacters: nextCharacters,
                relatedStories: nextRelatedStories,
                likeCount: nextLikeCount,
                coinBalance: nextCoinBalance,
                followerCount: cachedFollowerCount,
                isFollowing: cachedIsFollowing,
                updatedAt: new Date().toISOString(),
            };

            writeStoryDetailCache(storyId, userId, nextCache);
            setHydratedCache(nextCache);
            setDbStory(nextStory);
            setDbChapters(nextChapters);
            setStoryCharacters(nextCharacters);
            setRelatedStories(nextRelatedStories);
            setLikeCount(nextLikeCount);
            setIsLoading(false);
        };

        if (hasHydratedCache || isBackForwardNavigation) {
            rafId = window.requestAnimationFrame(() => {
                timeoutId = window.setTimeout(() => {
                    if (!cancelled) {
                        void fetchStoryDetails();
                    }
                }, 0);
            });
        } else {
            void fetchStoryDetails();
        }

        return () => {
            cancelled = true;
            if (rafId !== null) {
                window.cancelAnimationFrame(rafId);
            }
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
        };
    }, [storyId, userId, hasHydratedCache, isBackForwardNavigation, isLoadingAuth, cachedFollowerCount, cachedIsFollowing]);

    // Auto-dismiss toast
    useEffect(() => {
        if (!coinToast) return;
        const timer = setTimeout(() => setCoinToast(null), 2500);
        return () => clearTimeout(timer);
    }, [coinToast]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setIsChapterListExpanded(false);
        }, 0);

        return () => {
            window.clearTimeout(timer);
        };
    }, [storyId, dbStory?.path_mode, dbChapters.length]);

    useEffect(() => {
        document.body.classList.add('story-detail-dark-body');
        return () => {
            document.body.classList.remove('story-detail-dark-body');
        };
    }, []);

    useEffect(() => {
        if (!user) return;

        const timer = window.setTimeout(() => {
            setIsAuthDialogOpen(false);
            setAuthError(null);
            setIsAuthActionLoading(false);
        }, 0);

        return () => {
            window.clearTimeout(timer);
        };
    }, [user]);

    useEffect(() => {
        if (!userId) return;

        const fetchUnreadNotifications = async () => {
            const { count } = await supabase
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('is_read', false);
            setUnreadNotifCount(count || 0);
        };

        void fetchUnreadNotifications();
    }, [userId]);

    const topSearchQuery = topSearchInput.trim();

    useEffect(() => {
        let isActive = true;
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            setIsTopSearchLoading(true);
            setTopSearchStories([]);

            const loadSearchStories = async () => {
                try {
                    const response = await fetch(`/api/discovery?${buildStorySearchPanelQuery(topSearchQuery)}`, {
                        signal: controller.signal,
                    });

                    if (!response.ok) {
                        throw new Error(`DISCOVERY_HTTP_${response.status}`);
                    }

                    const payload = await response.json() as DiscoveryResponse;
                    if (!isActive || controller.signal.aborted) return;

                    setTopSearchStories(collectStorySearchPanelStories(payload, storyId));
                } catch (error) {
                    if (!isActive || controller.signal.aborted) return;
                    console.error('[StoryDetailsClient] search panel discovery failed:', error);
                    setTopSearchStories([]);
                } finally {
                    if (!isActive || controller.signal.aborted) return;
                    setIsTopSearchLoading(false);
                }
            };

            void loadSearchStories();
        }, topSearchQuery ? 140 : 0);

        return () => {
            isActive = false;
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [storyId, topSearchQuery]);

    useEffect(() => {
        if (!isProfileMenuOpen) return;

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (profileMenuRef.current?.contains(target)) return;
            setIsProfileMenuOpen(false);
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [isProfileMenuOpen]);

    const isStoryOwner = !!user && dbStory?.user_id === user.id;

    const handleDashboardAccess = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        setIsProfileMenuOpen(false);
        setAuthError(null);

        if (isLoadingAuth) return;

        if (user) {
            router.push('/dashboard');
            return;
        }

        setIsAuthDialogOpen(true);
    }, [isLoadingAuth, router, user]);

    const searchPanelContent = useMemo(
        () => (
            <StorySearchPanel
                stories={topSearchStories}
                query={topSearchQuery}
                isLoading={isTopSearchLoading}
            />
        ),
        [isTopSearchLoading, topSearchQuery, topSearchStories]
    );

    const handleTopSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const normalizedQuery = topSearchInput.trim();
        if (!normalizedQuery) {
            router.push('/');
            return;
        }
        router.push(`/?q=${encodeURIComponent(normalizedQuery)}`);
    };

    const handleOAuthLogin = async (provider: 'google' | 'facebook') => {
        setAuthError(null);
        setIsAuthActionLoading(true);

        try {
            if (provider === 'google') {
                await signInWithGoogle();
            } else {
                await signInWithFacebook();
            }
        } catch {
            setAuthError('ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่อีกครั้ง');
            setIsAuthActionLoading(false);
        }
    };

    const handleSignOut = async () => {
        try {
            await signOut();
            setIsProfileMenuOpen(false);
            router.push('/');
        } catch {
            setAuthError('ไม่สามารถออกจากระบบได้ในขณะนี้');
        }
    };

    const handleChapterClick = useCallback((chapter: DBChapter, index: number) => {
        const chapterHref = BRANCHING_FEATURE_ENABLED && dbStory?.path_mode === 'branching'
            ? `/story/${storyId}/read?chapterId=${chapter.id}`
            : `/story/${storyId}/read?chapter=${index}`;

        // Free chapters → navigate directly
        if (!chapter.is_premium || chapter.coin_price <= 0) {
            persistStoryDetailReturnState();
            router.push(chapterHref);
            return;
        }

        // Actually unlocked by paying coins or VIP → navigate directly
        if (chapter.can_read && chapter.access_source !== 'owner') {
            persistStoryDetailReturnState();
            router.push(chapterHref);
            return;
        }

        // Premium locked chapter → show coin dialog
        if (!user) {
            alert('กรุณาเข้าสู่ระบบก่อนอ่านตอนพิเศษ');
            return;
        }

        setUnlockError(null);
        setUnlockConfirmChapter({
            id: chapter.id,
            title: chapter.title,
            coinPrice: chapter.coin_price,
            index,
        });
    }, [user, storyId, router, dbStory, persistStoryDetailReturnState]);

    const handleConfirmUnlock = async () => {
        if (!unlockConfirmChapter || !user) return;

        const chapterToUnlock = unlockConfirmChapter;

        setIsUnlocking(true);
        setUnlockError(null);

        const { data, error } = await supabase.rpc('unlock_premium_chapter', {
            p_chapter_id: chapterToUnlock.id,
        });

        setIsUnlocking(false);

        if (error) {
            setUnlockError('ปลดล็อกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
            return;
        }

        const result = Array.isArray(data) && data.length > 0
            ? (data[0] as { success: boolean; message: string; new_balance: number })
            : null;

        if (!result || !result.success) {
            if (result?.message === 'INSUFFICIENT_COINS') {
                setUnlockError('เหรียญไม่พอสำหรับปลดล็อกตอนนี้');
            } else if (result?.message === 'FINANCE_RESTRICTED') {
                setUnlockError('บัญชีของคุณถูกจำกัดการทำธุรกรรมชั่วคราว');
            } else if (result?.message === 'FINANCE_BANNED') {
                setUnlockError('บัญชีของคุณถูกระงับสิทธิ์ด้านการเงิน');
            } else {
                setUnlockError('ปลดล็อกไม่สำเร็จ กรุณาลองใหม่');
            }
            if (Number.isFinite(Number(result?.new_balance))) {
                setCoinBalance(Number(result!.new_balance));
            }
            return;
        }

        const nextBalance = Number(result.new_balance);
        if (Number.isFinite(nextBalance)) {
            setCoinBalance(nextBalance);
        }

        // Auto-bookmark
        await supabase.from('favorites').delete().eq('story_id', storyId).eq('user_id', user.id);
        await supabase.from('favorites').insert({ story_id: storyId, user_id: user.id, chapter_id: chapterToUnlock.id });

        // Update chapter can_read state locally
        setDbChapters(prev => prev.map(ch =>
            ch.id === chapterToUnlock.id ? { ...ch, can_read: true, access_source: 'unlock' } : ch
        ));

        const unlockIdx = chapterToUnlock.index;

        // Show toast then navigate
        if (result.message === 'UNLOCKED') {
            setCoinToast({ coins: chapterToUnlock.coinPrice, balance: nextBalance });
        }

        setUnlockConfirmChapter(null);

        // Navigate after short delay for toast visibility
        setTimeout(() => {
            persistStoryDetailReturnState();
            if (BRANCHING_FEATURE_ENABLED && dbStory?.path_mode === 'branching') {
                router.push(`/story/${storyId}/read?chapterId=${chapterToUnlock.id}`);
            } else {
                router.push(`/story/${storyId}/read?chapter=${unlockIdx}`);
            }
        }, result.message === 'UNLOCKED' ? 800 : 100);
    };

    if (isLoading) {
        return (
            <main className={styles.main}>
                <div className={styles.statePage}>
                    <div className={styles.stateMessage}>
                        <p>กำลังโหลดข้อมูล...</p>
                    </div>
                </div>
            </main>
        );
    }

    if (!dbStory) {
        return (
            <main className={styles.main}>
                <div className={styles.statePage}>
                    <div className={styles.stateMessage}>
                        <h2 className={styles.stateTitle}>{loadError || 'ไม่พบข้อมูลเรื่อง'}</h2>
                    </div>
                </div>
            </main>
        );
    }

    const totalViews = dbChapters.reduce((sum, ch) => sum + ch.read_count, 0);
    const totalChapters = dbChapters.length;
    const cover = dbStory.cover_url || dbStory.cover_wide_url || fallbackCover;
    const heroBackdrop = dbStory.cover_wide_url || dbStory.cover_url || fallbackPromoCover;
    const isBranchingStory = BRANCHING_FEATURE_ENABLED && dbStory.path_mode === 'branching';
    const entryChapterId = dbStory.entry_chapter_id || dbChapters[0]?.id || null;
    const readerCtaState = totalChapters > 0
        ? deriveReaderCtaState(readerProgress, storyProgressVersion)
        : 'unread';
    const readHref = readerCtaState === 'completed'
        ? `/story/${storyId}/read?restart=1`
        : `/story/${storyId}/read`;
    const storyTypeLabel = resolveStoryTypeLabel(dbStory.category);
    const completionLabel = resolveCompletionLabel(dbStory.completion_status);
    const chapterSource = isBranchingStory
        ? dbChapters.filter((chapter) => chapter.id === entryChapterId || (entryChapterId === null && dbChapters.indexOf(chapter) === 0))
        : dbChapters;
    const canToggleChapterList = !isBranchingStory && chapterSource.length > 3;
    const displayChapters = isBranchingStory
        ? chapterSource
        : (isChapterListExpanded ? chapterSource : chapterSource.slice(0, 3));
    const showFollowButton = !isStoryOwner;
    const authorProfileHref = `/writer/${dbStory.user_id}`;
    const summaryItems: Array<{ label: string; value: string; accent?: boolean }> = [
        { label: 'หมวดหมู่', value: storyTypeLabel },
        { label: 'สถานะ', value: completionLabel, accent: true },
        { label: 'จำนวนตอน', value: totalChapters.toLocaleString('th-TH') },
        { label: 'ยอดอ่านรวม', value: totalViews.toLocaleString('th-TH') },
        { label: 'ถูกใจ', value: likeCount.toLocaleString('th-TH') },
        { label: 'ผู้ติดตาม', value: effectiveFollowerCount.toLocaleString('th-TH') },
    ];
    const chapterSectionTitle = isBranchingStory ? 'ตอนเริ่มต้น' : 'รายการตอน';
    const chapterSectionMeta = isBranchingStory
        ? 'เริ่มจากตอนเริ่มต้นและดำเนินเรื่องต่อด้วยการเลือกเส้นทาง'
        : canToggleChapterList
            ? `กำลังแสดง ${displayChapters.length.toLocaleString('th-TH')} จาก ${chapterSource.length.toLocaleString('th-TH')} ตอน`
            : `กำลังแสดง ${chapterSource.length.toLocaleString('th-TH')} ตอน`;
    const readActionLabel = dbChapters.length === 0
        ? 'เริ่มอ่าน'
        : readerCtaState === 'completed'
            ? 'อ่านซ้ำ'
            : readerCtaState === 'in_progress'
                ? 'อ่านต่อ'
                : 'เริ่มอ่าน';
    const actionNote = dbChapters.length === 0
        ? 'ยังไม่มีตอนที่เผยแพร่'
        : readerCtaState === 'completed'
            ? 'เริ่มใหม่จากตอนแรก'
            : readerCtaState === 'in_progress'
                ? 'อ่านต่อจากจุดที่คุณอ่านล่าสุด'
                : 'เริ่มจากตอนเปิดเรื่อง';
    const readCtaVariantClassName = readerCtaState === 'completed'
        ? styles.readCtaCompleted
        : readerCtaState === 'in_progress'
            ? styles.readCtaInProgress
            : styles.readCtaUnread;
    const storyShareText = dbStory.synopsis.trim() || 'อ่านเรื่องนี้บน FlowFic';
    const storyDetailMobileActions = (
        <div className="ffMobileActionInner">
            <Link
                href={readHref}
                className={`ffMobileActionBtn ffMobileActionBtnPrimary ${styles.mobileActionBtn} ${readCtaVariantClassName}`}
                onClick={persistStoryDetailReturnState}
            >
                <PlaySquare size={18} fill="currentColor" />
                <span>{readActionLabel}</span>
            </Link>
            {showFollowButton && (
                <button
                    type="button"
                    className={[
                        'ffMobileActionBtn',
                        effectiveIsFollowing ? 'ffMobileActionBtnPrimary' : 'ffMobileActionBtnSecondary',
                        styles.mobileActionBtn,
                    ].join(' ')}
                    onClick={toggleFollow}
                    disabled={isFollowLoading}
                >
                    {effectiveIsFollowing ? <UserCheck size={18} /> : <UserPlus size={18} />}
                    <span>{effectiveIsFollowing ? 'กำลังติดตาม' : 'ติดตาม'}</span>
                </button>
            )}
        </div>
    );

    const renderChapterItem = (chapter: DBChapter) => {
        const chapterIndex = dbChapters.findIndex((item) => item.id === chapter.id);
        const safeChapterIndex = chapterIndex >= 0 ? chapterIndex : Math.max(0, chapter.order_index);
        const chapterNumber = chapterIndex >= 0 ? chapterIndex + 1 : chapter.order_index + 1;
        const isPremium = chapter.is_premium && chapter.coin_price > 0;
        const isAccessiblePremium = isPremium && chapter.can_read;
        const premiumStatusLabel = !isPremium
            ? null
            : !chapter.can_read
                ? `${chapter.coin_price.toLocaleString('th-TH')} เหรียญ`
                : chapter.access_source === 'unlock'
                    ? 'ปลดล็อกแล้ว'
                    : chapter.access_source === 'vip'
                        ? 'สิทธิ์ VIP'
                        : chapter.access_source === 'owner'
                            ? 'พรีเมียม'
                            : 'อ่านได้';
        const premiumStatusClass = !isPremium
            ? ''
            : isAccessiblePremium
                ? styles.chapterStatusAccessible
                : styles.chapterStatusPremium;
        const chapterActionLabel = !isPremium || chapter.can_read
            ? (isBranchingStory ? 'เริ่มอ่าน' : 'อ่าน')
            : `ปลดล็อก ${chapter.coin_price.toLocaleString('th-TH')} เหรียญ`;

        return (
            <button
                key={chapter.id}
                type="button"
                className={[styles.chapterItem, isBranchingStory && styles.chapterItemBranching].filter(Boolean).join(' ')}
                onClick={() => handleChapterClick(chapter, safeChapterIndex)}
            >
                {!isBranchingStory && (
                    <span className={styles.chapterNumber}>
                        {String(chapterNumber).padStart(2, '0')}
                    </span>
                )}
                <span className={styles.chapterBody}>
                    <span className={styles.chapterHeadingRow}>
                        <span className={styles.chapterTitle}>{chapter.title}</span>
                        {premiumStatusLabel && (
                            <span className={`${styles.chapterStatus} ${premiumStatusClass}`.trim()}>
                                {premiumStatusLabel}
                            </span>
                        )}
                    </span>
                    <span className={styles.chapterMeta}>
                        <span>{chapter.read_count.toLocaleString('th-TH')} อ่าน</span>
                        <span>{formatThaiDate(chapter.created_at)}</span>
                    </span>
                </span>
                <span className={styles.chapterActionLabel}>{chapterActionLabel}</span>
                <span className={[styles.chapterAction, isBranchingStory && styles.chapterActionBranching].filter(Boolean).join(' ')}>
                    {!isPremium || chapter.can_read ? <ChevronRight size={16} /> : <Lock size={14} />}
                </span>
            </button>
        );
    };

    return (
        <main className={styles.main}>
            <SharedNavbar
                user={user}
                isLoadingAuth={isLoadingAuth}
                coinBalance={coinBalance}
                unreadNotifCount={unreadNotifCount}
                searchValue={topSearchInput}
                onSearchChange={setTopSearchInput}
                onSearchSubmit={handleTopSearchSubmit}
                searchPanel={searchPanelContent}
                onDashboardAccess={handleDashboardAccess}
                isProfileMenuOpen={isProfileMenuOpen}
                profileMenuRef={profileMenuRef}
                onToggleProfileMenu={() => setIsProfileMenuOpen((prev) => !prev)}
                onCloseProfileMenu={() => setIsProfileMenuOpen(false)}
                onOpenLogin={() => {
                    setAuthError(null);
                    setIsAuthDialogOpen(true);
                }}
                onSignOut={handleSignOut}
            />

            <div className="ffPageContainer">
                <section className={styles.heroSection}>
                    <div className={styles.heroBackdrop} style={{ backgroundImage: `url(${heroBackdrop})` }} />
                    <div className={styles.heroGradient} />
                    <div className={styles.heroInner}>
                        <div className={styles.heroCoverWrap}>
                            <img src={cover} alt={dbStory.title} className={styles.heroCoverImage} />
                        </div>
                        <div className={styles.heroCopy}>
                            <div className={styles.heroMetaRow}>
                                <span className={styles.heroMetaTag}>{storyTypeLabel}</span>
                                <span className={styles.heroMetaDot} />
                                <span className={styles.heroMetaTag}>เรื่องแนะนำ</span>
                                {isBranchingStory && (
                                    <span className={styles.pathModePill}>โต้ตอบได้</span>
                                )}
                            </div>
                            <h1 className={styles.heroTitle}>{dbStory.title}</h1>
                            <p className={styles.heroAuthor}>
                                โดย{' '}
                                <Link href={authorProfileHref} className={styles.authorLink}>
                                    {dbStory.pen_name}
                                </Link>
                            </p>
                            <div className={styles.heroActions}>
                                <Link
                                    href={readHref}
                                    className={`${styles.primaryActionBtn} ${readCtaVariantClassName}`}
                                    onClick={persistStoryDetailReturnState}
                                >
                                    <PlaySquare size={18} fill="currentColor" />
                                    {readActionLabel}
                                </Link>
                                <ShareButton
                                    title={dbStory.title}
                                    text={storyShareText}
                                    urlPath={`/story/${storyId}`}
                                    idleLabel="แชร์"
                                    className={styles.shareBtn}
                                    sharedLabel="แชร์แล้ว"
                                    copiedLabel="คัดลอกแล้ว"
                                    errorLabel="แชร์ไม่สำเร็จ"
                                />
                                {showFollowButton && (
                                    <button
                                        type="button"
                                        className={`${styles.followBtn} ${effectiveIsFollowing ? styles.followBtnActive : ''}`}
                                        onClick={toggleFollow}
                                        disabled={isFollowLoading}
                                    >
                                        {effectiveIsFollowing ? <UserCheck size={16} /> : <Bookmark size={16} />}
                                        <span>{effectiveIsFollowing ? 'บันทึกแล้ว' : 'บันทึกเรื่อง'}</span>
                                    </button>
                                )}
                            </div>
                            <p className={styles.actionNote}>{actionNote}</p>
                        </div>
                    </div>
                </section>

                <section className={styles.statsStrip}>
                    <div className={styles.statsInner}>
                        {summaryItems.map((item) => (
                            <div key={item.label} className={styles.statsItem}>
                                <span className={styles.statsLabel}>{item.label}</span>
                                <strong className={`${styles.statsValue} ${item.accent ? styles.statsValueAccent : ''}`}>
                                    {item.value}
                                </strong>
                            </div>
                        ))}
                    </div>
                </section>

                <div className={styles.contentGrid}>
                    <div className={styles.mainColumn}>
                        <section className={styles.panel}>
                            <div className={styles.panelHeader}>
                                <h2 className={`${styles.panelTitle} ${styles.panelTitleSynopsis}`}>เรื่องย่อ</h2>
                            </div>
                            <p className={styles.synopsisText}>{dbStory.synopsis || 'ยังไม่มีเรื่องย่อสำหรับเรื่องนี้'}</p>
                        </section>

                        <section className={styles.panel}>
                            <div className={styles.panelHeader}>
                                <h2 className={styles.panelTitle}>{chapterSectionTitle}</h2>
                                <span className={styles.panelMeta}>{chapterSectionMeta}</span>
                            </div>
                            {displayChapters.length === 0 ? (
                                <div className={styles.emptyState}>ยังไม่มีตอนที่เผยแพร่</div>
                            ) : (
                                <div className={styles.chapterList}>
                                    {displayChapters.map((chapter) => renderChapterItem(chapter))}
                                </div>
                            )}
                            {canToggleChapterList && (
                                <button
                                    type="button"
                                    className={styles.chapterToggleBtn}
                                    onClick={() => setIsChapterListExpanded((prev) => !prev)}
                                >
                                    {isChapterListExpanded ? 'แสดงน้อยลง' : 'ดูตอนทั้งหมด'}
                                </button>
                            )}
                        </section>

                        {storyCharacters.length > 0 && (
                            <section className={styles.panel}>
                                <div className={styles.panelHeader}>
                                    <h2 className={styles.panelTitle}>ตัวละคร ({storyCharacters.length.toLocaleString('th-TH')})</h2>
                                </div>
                                <div className={styles.characterShowcase}>
                                    <div className={styles.characterCardGrid}>
                                        {storyCharacters.map((character) => (
                                            <article key={character.id} className={styles.readerCharacterCard}>
                                                <div className={styles.readerCharacterPortrait}>
                                                    {character.image_url ? (
                                                        <img
                                                            src={character.image_url}
                                                            alt={character.name}
                                                            className={styles.readerCharacterImage}
                                                        />
                                                    ) : (
                                                        <div className={styles.readerCharacterPlaceholder}>
                                                            {character.name.trim().charAt(0)}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className={styles.readerCharacterInfo}>
                                                    <h3 className={styles.readerCharacterName}>{character.name}</h3>
                                                    {character.age && (
                                                        <div className={styles.readerCharacterMeta}>อายุ: {character.age}</div>
                                                    )}
                                                    {character.occupation && (
                                                        <div className={styles.readerCharacterMeta}>อาชีพ: {character.occupation}</div>
                                                    )}
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>

                    <aside className={styles.sideColumn}>
                        <section className={styles.sidePanel}>
                            <h3 className={styles.sidePanelTitle}>
                                ผลงานอื่นของ{' '}
                                <Link href={authorProfileHref} className={styles.authorLink}>
                                    {dbStory.pen_name}
                                </Link>
                            </h3>
                            {relatedStories.length === 0 ? (
                                <p className={styles.relatedEmpty}>ยังไม่มีเรื่องอื่นที่เผยแพร่</p>
                            ) : (
                                <div className={styles.relatedList}>
                                    {relatedStories.map((story) => (
                                        <Link key={story.id} href={`/story/${story.id}`} className={styles.relatedItem}>
                                            <div className={styles.relatedCover}>
                                                <img src={story.cover} alt={story.title} className={styles.relatedCoverImage} />
                                            </div>
                                            <div className={styles.relatedInfo}>
                                                <h4 className={styles.relatedTitle}>{story.title}</h4>
                                                <p className={styles.relatedMeta}>{story.categoryLabel} · {story.completionLabel}</p>
                                                <p className={styles.relatedStat}>
                                                    {story.readCount.toLocaleString('th-TH')} อ่าน · {formatThaiDate(story.createdAt)}
                                                </p>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </section>

                    </aside>
                </div>
            </div>

            <div className="ffMobileActionBar">
                {storyDetailMobileActions}
            </div>

            {isAuthDialogOpen && (
                <div
                    className={styles.authDialogOverlay}
                    onClick={() => {
                        if (isAuthActionLoading) return;
                        setIsAuthDialogOpen(false);
                        setAuthError(null);
                    }}
                >
                    <div className={styles.authDialogCard} onClick={(event) => event.stopPropagation()}>
                        <button
                            type="button"
                            className={styles.authDialogClose}
                            onClick={() => {
                                if (isAuthActionLoading) return;
                                setIsAuthDialogOpen(false);
                                setAuthError(null);
                            }}
                            aria-label="ปิด"
                        >
                            <X size={18} />
                        </button>
                        <h3 className={styles.authDialogTitle}>เข้าสู่ระบบก่อนเข้าแดชบอร์ดนักเขียน</h3>
                        <p className={styles.authDialogMessage}>
                            เข้าสู่ระบบเพื่อดูสถิติ จัดการเรื่อง และเครื่องมือเผยแพร่สำหรับนักเขียน
                        </p>
                        {authError && <p className={styles.authDialogError}>{authError}</p>}
                        <div className={styles.authDialogActions}>
                            <button
                                type="button"
                                className={styles.authDialogPrimaryBtn}
                                onClick={() => void handleOAuthLogin('google')}
                                disabled={isAuthActionLoading}
                            >
                                {isAuthActionLoading ? 'กำลังเชื่อมต่อ...' : 'เข้าสู่ระบบด้วย Google'}
                            </button>
                            <button
                                type="button"
                                className={styles.authDialogSecondaryBtn}
                                onClick={() => void handleOAuthLogin('facebook')}
                                disabled={isAuthActionLoading}
                            >
                                เข้าสู่ระบบด้วย Facebook
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Coin Spending Dialog */}
            {unlockConfirmChapter && (
                <div className={styles.coinDialogOverlay} onClick={() => setUnlockConfirmChapter(null)}>
                    <div className={styles.coinDialogCard} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.coinDialogIcon}>
                            <Coins size={32} />
                        </div>
                        <h3 className={styles.coinDialogTitle}>ปลดล็อกตอนพิเศษ</h3>
                        <p className={styles.coinDialogDesc}>
                            ใช้เหรียญเพื่ออ่าน <strong>{unlockConfirmChapter.title}</strong>
                        </p>
                        <div className={styles.coinDialogPrice}>
                            <Coins size={22} />
                            {unlockConfirmChapter.coinPrice.toLocaleString('th-TH')} เหรียญ
                        </div>
                        <div className={styles.coinDialogBalance}>
                            <Coins size={14} />
                            คงเหลือ {coinBalance.toLocaleString('th-TH')} เหรียญ
                        </div>
                        {unlockError && <p className={styles.coinDialogError}>{unlockError}</p>}
                        <div className={styles.coinDialogActions}>
                            <button
                                className={styles.coinDialogCancelBtn}
                                onClick={() => setUnlockConfirmChapter(null)}
                                disabled={isUnlocking}
                            >
                                ยกเลิก
                            </button>
                            <button
                                className={styles.coinDialogConfirmBtn}
                                onClick={handleConfirmUnlock}
                                disabled={isUnlocking}
                            >
                                {isUnlocking ? 'กำลังปลดล็อก...' : `ยืนยัน ${unlockConfirmChapter.coinPrice.toLocaleString('th-TH')} เหรียญ`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Success Toast */}
            {coinToast && (
                <div className={styles.coinToast} key={`toast-${coinToast.coins}-${coinToast.balance}`}>
                    <div className={styles.coinToastIconCircle}>
                        <Coins size={16} />
                    </div>
                    <span className={styles.coinToastText}>
                        ใช้ {coinToast.coins.toLocaleString('th-TH')} เหรียญสำเร็จ!
                    </span>
                    <span className={styles.coinToastBal}>
                        เหลือ {coinToast.balance.toLocaleString('th-TH')}
                    </span>
                </div>
            )}
        </main>
    );
}
