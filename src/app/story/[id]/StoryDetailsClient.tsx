'use client';

import { useState, useEffect, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { FEATURE_FLAGS } from '@/lib/featureFlags';
import {
    BookOpen,
    Clock,
    Coins,
    ChevronRight,
    Eye,
    Heart,
    Lock,
    MessageCircle,
    Star,
} from 'lucide-react';
import styles from './details.module.css';
import { useTracking } from '@/hooks/useTracking';
import { useFollow } from '@/hooks/useFollow';
import { useAuth } from '@/contexts/AuthContext';
import { ShareButton } from '@/components/share/ShareButton';
import { SharedNavbar } from '@/components/navigation/SharedNavbar';
import { ChatStoryDetailsLayout } from '@/components/story/chat/ChatStoryDetailsLayout';
import { getMainCategoryLabel, getSubCategoryLabel } from '@/lib/categories';
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
    main_category: string | null;
    sub_category: string | null;
    fandom: string | null;
    tags: string[] | null;
    rating: string | null;
    writing_style: string | null;
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

type AuthorProfileRow = {
    id: string;
    pen_name: string | null;
    bio: string | null;
    avatar_url: string | null;
};

type AuthorSummary = {
    id: string;
    penName: string;
    bio: string;
    avatarUrl: string | null;
};

type StoryCommentRow = {
    id: string;
    user_id: string;
    content: string;
    created_at: string;
};

type CommentProfileRow = {
    id: string;
    pen_name: string | null;
    avatar_url: string | null;
};

type CommentPreviewItem = {
    id: string;
    userId: string;
    content: string;
    createdAt: string;
    penName: string;
    avatarUrl: string | null;
};

type RecommendedStory = {
    id: string;
    title: string;
    penName: string;
    categoryLabel: string;
    completionLabel: string;
    cover: string;
    readCount: number;
    createdAt: string;
    source: 'author' | 'platform';
};

type StoryDetailTab = 'overview' | 'chapters' | 'comments';

type StoryDetailCacheEntry = {
    story: DBStory;
    chapters: DBChapter[];
    storyCharacters: StoryCharacter[];
    relatedStories: RelatedStory[];
    authorSummary: AuthorSummary | null;
    commentPreview: CommentPreviewItem[];
    recommendedStories: RecommendedStory[];
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

const resolveWritingStyleLabel = (writingStyle: string | null | undefined): string => {
    if (writingStyle === 'chat') return 'แชต';
    if (writingStyle === 'thread') return 'เธรด';
    if (writingStyle === 'visual_novel') return 'วิชวลโนเวล';
    return 'บรรยาย';
};

const resolveRatingLabel = (rating: string | null | undefined): string => {
    if (rating === '13+' || rating === '18+') return rating;
    return 'ทั่วไป';
};

const formatThaiRelativeTime = (value: string): string => {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return formatThaiDate(value);

    const diffMs = Date.now() - timestamp;
    if (diffMs < 0) return formatThaiDate(value);

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diffMs < hour) {
        const minutes = Math.max(1, Math.floor(diffMs / minute));
        return `${minutes.toLocaleString('th-TH')} นาทีที่แล้ว`;
    }

    if (diffMs < day) {
        const hours = Math.max(1, Math.floor(diffMs / hour));
        return `${hours.toLocaleString('th-TH')} ชม. ที่แล้ว`;
    }

    if (diffMs < 7 * day) {
        const days = Math.max(1, Math.floor(diffMs / day));
        return `${days.toLocaleString('th-TH')} วันที่แล้ว`;
    }

    return formatThaiDate(value);
};

const STORY_SEARCH_PANEL_LIMIT = 8;
const STORY_COMMENT_PREVIEW_LIMIT = 3;
const STORY_DISCOVERY_RECOMMEND_LIMIT = 12;

const compareSearchStoriesByPriority = (a: DiscoveryStory, b: DiscoveryStory): number => {
    if (b.score_7d !== a.score_7d) return b.score_7d - a.score_7d;
    if (b.total_view_count !== a.total_view_count) return b.total_view_count - a.total_view_count;

    const createdAtA = a.created_at ? Date.parse(a.created_at) : 0;
    const createdAtB = b.created_at ? Date.parse(b.created_at) : 0;
    const safeCreatedAtA = Number.isNaN(createdAtA) ? 0 : createdAtA;
    const safeCreatedAtB = Number.isNaN(createdAtB) ? 0 : createdAtB;
    return safeCreatedAtB - safeCreatedAtA;
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

const buildDiscoveryRecommendationQuery = (story: DBStory): string => {
    const params = new URLSearchParams();
    params.set('focusCore', 'false');
    params.set('limit', String(STORY_DISCOVERY_RECOMMEND_LIMIT));
    if (story.main_category) params.set('category', story.main_category);
    if (story.sub_category) params.set('subCategory', story.sub_category);
    return params.toString();
};

const resolveRecommendationCategoryLabel = (
    category: string | null | undefined,
    mainCategory: string | null | undefined,
    subCategory: string | null | undefined
): string => {
    const subCategoryLabel = getSubCategoryLabel(subCategory);
    if (subCategoryLabel) return subCategoryLabel;
    const mainCategoryLabel = getMainCategoryLabel(mainCategory);
    if (mainCategoryLabel) return mainCategoryLabel;
    return resolveStoryTypeLabel(category);
};

const normalizeTagList = (tags: string[] | null | undefined): string[] => {
    if (!Array.isArray(tags)) return [];
    return tags
        .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
        .filter((tag) => tag.length > 0)
        .slice(0, 4);
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
            authorSummary: parsed.authorSummary && typeof parsed.authorSummary === 'object'
                ? parsed.authorSummary as AuthorSummary
                : null,
            commentPreview: Array.isArray(parsed.commentPreview)
                ? parsed.commentPreview as CommentPreviewItem[]
                : [],
            recommendedStories: Array.isArray(parsed.recommendedStories)
                ? parsed.recommendedStories as RecommendedStory[]
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
    const [authorSummary, setAuthorSummary] = useState<AuthorSummary | null>(null);
    const [commentPreview, setCommentPreview] = useState<CommentPreviewItem[]>([]);
    const [recommendedStories, setRecommendedStories] = useState<RecommendedStory[]>([]);
    const [likeCount, setLikeCount] = useState(0);
    const [loadError, setLoadError] = useState('');
    const [hydratedCache, setHydratedCache] = useState<StoryDetailCacheEntry | null>(null);
    const [activeTab, setActiveTab] = useState<StoryDetailTab>('overview');
    const [isLiked, setIsLiked] = useState(false);
    const [isLikePending, setIsLikePending] = useState(false);
    const hasRestoredScrollRef = useRef(false);
    const hasConsumedReturnIntentRef = useRef(false);
    const isReturnNavigationRef = useRef(false);

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
    const [isSynopsisExpanded, setIsSynopsisExpanded] = useState(false);
    const [unreadNotifCountState, setUnreadNotifCountState] = useState(0);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef<HTMLDivElement>(null);
    const unreadNotifCount = userId ? unreadNotifCountState : 0;

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
            setAuthorSummary(fallbackCached.authorSummary);
            setCommentPreview(fallbackCached.commentPreview);
            setRecommendedStories(fallbackCached.recommendedStories);
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
            setAuthorSummary(cached.authorSummary);
            setCommentPreview(cached.commentPreview);
            setRecommendedStories(cached.recommendedStories);
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
        setAuthorSummary(null);
        setCommentPreview([]);
        setRecommendedStories([]);
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
            authorSummary,
            commentPreview,
            recommendedStories,
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
        authorSummary,
        commentPreview,
        recommendedStories,
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
                setAuthorSummary(null);
                setCommentPreview([]);
                setRecommendedStories([]);
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

            const { data: authorProfileRow, error: authorProfileError } = await supabase
                .from('profiles')
                .select('id, pen_name, bio, avatar_url')
                .eq('id', storyData.user_id)
                .maybeSingle();
            if (authorProfileError) {
                console.warn('[StoryDetail] Failed to fetch author profile summary:', authorProfileError);
            }

            const { data: commentRows, error: commentRowsError } = await supabase
                .from('comments')
                .select('id, user_id, content, created_at')
                .eq('story_id', storyId)
                .order('created_at', { ascending: false })
                .limit(STORY_COMMENT_PREVIEW_LIMIT);
            if (commentRowsError) {
                console.warn('[StoryDetail] Failed to fetch comment preview:', commentRowsError);
            }

            const commentUserIds = Array.from(
                new Set(((commentRows as StoryCommentRow[] | null) || []).map((comment) => comment.user_id).filter(Boolean))
            );
            let commentProfiles: CommentProfileRow[] = [];
            if (commentUserIds.length > 0) {
                const { data: commentProfileRows, error: commentProfileError } = await supabase
                    .from('profiles')
                    .select('id, pen_name, avatar_url')
                    .in('id', commentUserIds);
                if (commentProfileError) {
                    console.warn('[StoryDetail] Failed to fetch comment author profiles:', commentProfileError);
                } else {
                    commentProfiles = (commentProfileRows as CommentProfileRow[] | null) || [];
                }
            }

            let discoveryStories: DiscoveryStory[] = [];
            try {
                const discoveryResponse = await fetch(`/api/discovery?${buildDiscoveryRecommendationQuery(storyData as DBStory)}`);
                if (discoveryResponse.ok) {
                    const discoveryPayload = await discoveryResponse.json() as DiscoveryResponse;
                    discoveryStories = collectStorySearchPanelStories(discoveryPayload, storyId);
                }
            } catch (error) {
                console.warn('[StoryDetail] Failed to fetch discovery recommendations:', error);
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
            let nextIsLiked = false;
            if (userId) {
                const [{ data: walletData }, { data: unlockRows }, { data: progressRow }, { data: likeRow }] = await Promise.all([
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
                    supabase
                        .from('likes')
                        .select('chapter_id')
                        .eq('story_id', storyId)
                        .eq('user_id', userId)
                        .maybeSingle(),
                ]);

                nextCoinBalance = walletData?.coin_balance || 0;
                nextIsLiked = !!likeRow?.chapter_id;
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
            setIsLiked(nextIsLiked);

            const mergedProgress = mergeStoredStoryProgress(localStoredProgress, remoteProgress);
            if (mergedProgress) {
                writeStoredStoryProgress(storyId, userId, mergedProgress);
            }
            setReaderProgress(mergedProgress);
            setStoryProgressVersion(normalizeStoryProgressVersionValue(storyProgressVersionData));

            const nextStory = storyData as DBStory;
            const nextChapters = chapterData as DBChapter[] || [];
            const nextCharacters = ((characterRows as StoryCharacter[] | null) || []).filter((character) => character.name.trim().length > 0);
            const nextAuthorSummaryRow = authorProfileRow as AuthorProfileRow | null;
            const nextAuthorSummary: AuthorSummary = {
                id: storyData.user_id,
                penName: (nextAuthorSummaryRow?.pen_name || nextStory.pen_name || 'นักเขียนนิรนาม').trim() || 'นักเขียนนิรนาม',
                bio: (nextAuthorSummaryRow?.bio || '').trim(),
                avatarUrl: nextAuthorSummaryRow?.avatar_url || null,
            };
            const commentProfileMap = new Map(commentProfiles.map((profile) => [profile.id, profile]));
            const nextCommentPreview = ((commentRows as StoryCommentRow[] | null) || []).map((comment) => {
                const profile = commentProfileMap.get(comment.user_id);
                return {
                    id: comment.id,
                    userId: comment.user_id,
                    content: comment.content || '',
                    createdAt: comment.created_at || new Date(0).toISOString(),
                    penName: (profile?.pen_name || 'ผู้อ่าน').trim() || 'ผู้อ่าน',
                    avatarUrl: profile?.avatar_url || null,
                };
            });
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
            const authorSourceRecommendations: RecommendedStory[] = nextRelatedStories.map((story) => ({
                ...story,
                source: 'author',
            }));
            const platformRecommendations: RecommendedStory[] = discoveryStories.map((story) => ({
                id: story.id,
                title: story.title,
                penName: story.pen_name,
                categoryLabel: resolveRecommendationCategoryLabel(story.category, story.main_category, story.sub_category),
                completionLabel: resolveCompletionLabel(story.completion_status),
                cover: story.cover_url || story.cover_wide_url || fallbackCover,
                readCount: story.total_view_count || 0,
                createdAt: story.created_at || new Date(0).toISOString(),
                source: 'platform',
            }));
            const recommendationMap = new Map<string, RecommendedStory>();
            [...authorSourceRecommendations, ...platformRecommendations].forEach((story) => {
                if (!story.id || story.id === storyId) return;
                if (!recommendationMap.has(story.id)) recommendationMap.set(story.id, story);
            });
            const nextRecommendedStories = Array.from(recommendationMap.values()).slice(0, STORY_DISCOVERY_RECOMMEND_LIMIT);
            const nextLikeCount = likesCount || 0;
            const nextCache: StoryDetailCacheEntry = {
                story: nextStory,
                chapters: nextChapters,
                storyCharacters: nextCharacters,
                relatedStories: nextRelatedStories,
                authorSummary: nextAuthorSummary,
                commentPreview: nextCommentPreview,
                recommendedStories: nextRecommendedStories,
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
            setAuthorSummary(nextAuthorSummary);
            setCommentPreview(nextCommentPreview);
            setRecommendedStories(nextRecommendedStories);
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

    useEffect(() => {
        if (!userId) return;

        const fetchUnread = async () => {
            const { count } = await supabase
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('is_read', false);

            setUnreadNotifCountState(count || 0);
        };

        void fetchUnread();
    }, [userId]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setIsChapterListExpanded(false);
            setIsSynopsisExpanded(false);
            setActiveTab('overview');
            setIsLiked(false);
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

    const handleToggleLike = useCallback(async () => {
        if (isLikePending) return;
        if (!user) {
            alert('กรุณาเข้าสู่ระบบก่อนกดหัวใจ');
            return;
        }

        const targetChapterId = dbStory?.entry_chapter_id || dbChapters[0]?.id;
        if (!targetChapterId) {
            alert('เรื่องนี้ยังไม่มีตอนสำหรับกดเลิฟ');
            return;
        }

        setIsLikePending(true);

        if (isLiked) {
            const { error } = await supabase
                .from('likes')
                .delete()
                .eq('story_id', storyId)
                .eq('user_id', user.id);

            if (!error) {
                setIsLiked(false);
                setLikeCount((prev) => Math.max(0, prev - 1));
            }
            setIsLikePending(false);
            return;
        }

        const { error: clearError } = await supabase
            .from('likes')
            .delete()
            .eq('story_id', storyId)
            .eq('user_id', user.id);

        if (clearError) {
            setIsLikePending(false);
            return;
        }

        const { error: insertError } = await supabase
            .from('likes')
            .insert({ story_id: storyId, user_id: user.id, chapter_id: targetChapterId });

        if (!insertError) {
            setIsLiked(true);
            setLikeCount((prev) => prev + 1);
        }

        setIsLikePending(false);
    }, [dbChapters, dbStory?.entry_chapter_id, isLikePending, isLiked, storyId, user]);

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

    const handleSignOut = useCallback(async () => {
        try {
            setIsProfileMenuOpen(false);
            await signOut();
            router.push('/');
        } catch (error) {
            console.error('[StoryDetailsClient] Sign out failed:', error);
        }
    }, [router, signOut]);

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
    const heroBackdrop = dbStory.cover_wide_url || dbStory.cover_url || fallbackPromoCover;
    const isBranchingStory = BRANCHING_FEATURE_ENABLED && dbStory.path_mode === 'branching';
    const entryChapterId = dbStory.entry_chapter_id || dbChapters[0]?.id || null;
    const readerCtaState = totalChapters > 0
        ? deriveReaderCtaState(readerProgress, storyProgressVersion)
        : 'unread';
    const readHref = readerCtaState === 'completed'
        ? `/story/${storyId}/read?restart=1`
        : `/story/${storyId}/read`;
    const isStoryOwner = !!user && dbStory.user_id === user.id;
    const storyTypeLabel = resolveStoryTypeLabel(dbStory.category);
    const completionLabel = resolveCompletionLabel(dbStory.completion_status);
    const writingStyleLabel = resolveWritingStyleLabel(dbStory.writing_style);
    const ratingLabel = resolveRatingLabel(dbStory.rating);
    const mainCategoryLabel = getMainCategoryLabel(dbStory.main_category);
    const subCategoryLabel = getSubCategoryLabel(dbStory.sub_category);
    const displayCategoryLabel = subCategoryLabel || mainCategoryLabel || storyTypeLabel;
    const authorProfileHref = `/writer/${dbStory.user_id}`;
    const resolvedAuthorSummary: AuthorSummary = authorSummary || {
        id: dbStory.user_id,
        penName: dbStory.pen_name,
        bio: '',
        avatarUrl: null,
    };
    const authorInitial = resolvedAuthorSummary.penName.trim().charAt(0).toUpperCase() || 'W';
    const tagList = normalizeTagList(dbStory.tags);
    const metadataChips = [
        completionLabel,
        writingStyleLabel,
        ratingLabel,
        isBranchingStory ? 'โต้ตอบได้' : 'อ่านต่อเนื่อง',
        dbStory.fandom?.trim() || null,
        ...tagList,
    ]
        .map((chip) => (typeof chip === 'string' ? chip.trim() : ''))
        .filter((chip) => chip.length > 0)
        .slice(0, 8);
    const chapterSource = isBranchingStory
        ? dbChapters.filter((chapter) => chapter.id === entryChapterId || (entryChapterId === null && dbChapters.indexOf(chapter) === 0))
        : dbChapters;
    const canToggleChapterList = !isBranchingStory && chapterSource.length > 6;
    const displayChapters = isBranchingStory
        ? chapterSource
        : (isChapterListExpanded ? chapterSource : chapterSource.slice(0, 6));
    const synopsisContent = dbStory.synopsis || 'ยังไม่มีเรื่องย่อสำหรับเรื่องนี้';
    const hasSynopsisPreviewToggle = synopsisContent.trim().length > 180;
    const commentPreviewItems = commentPreview.slice(0, STORY_COMMENT_PREVIEW_LIMIT);
    const readActionLabel = dbChapters.length === 0
        ? 'เริ่มอ่าน'
        : readerCtaState === 'completed'
            ? 'อ่านซ้ำ'
            : readerCtaState === 'in_progress'
                ? 'อ่านต่อ'
                : 'เริ่มอ่าน';
    const readActionLabelMain = dbChapters.length === 0
        ? 'ยังไม่มีตอน'
        : readerCtaState === 'completed'
            ? 'อ่านซ้ำเลย'
            : readerCtaState === 'in_progress'
                ? 'อ่านต่อเลย'
                : 'เริ่มอ่านเลย';
    const actionNote = dbChapters.length === 0
        ? 'ยังไม่มีตอนที่เผยแพร่'
        : readerCtaState === 'completed'
            ? 'เริ่มใหม่จากตอนแรก'
            : readerCtaState === 'in_progress'
                ? 'อ่านต่อจากจุดล่าสุด'
                : 'เริ่มจากตอนเปิดเรื่อง';
    const storyShareText = dbStory.synopsis.trim() || 'อ่านเรื่องนี้บน FlowFic';
    const statItems = [
        { label: 'ยอดเลิฟ', value: likeCount.toLocaleString('th-TH'), tone: 'love' as const },
        { label: 'ชั้นหนังสือ', value: effectiveFollowerCount.toLocaleString('th-TH'), tone: 'shelf' as const },
        { label: 'จำนวนตอน', value: totalChapters.toLocaleString('th-TH'), tone: 'neutral' as const },
        { label: 'ยอดอ่าน', value: totalViews.toLocaleString('th-TH'), tone: 'neutral' as const },
    ];

    const renderChapterItem = (chapter: DBChapter) => {
        const chapterIndex = dbChapters.findIndex((item) => item.id === chapter.id);
        const safeChapterIndex = chapterIndex >= 0 ? chapterIndex : Math.max(0, chapter.order_index);
        const isPremium = chapter.is_premium && chapter.coin_price > 0;
        const isLocked = isPremium && !chapter.can_read;

        return (
            <button
                key={chapter.id}
                type="button"
                className={styles.chapterRow}
                onClick={() => handleChapterClick(chapter, safeChapterIndex)}
            >
                <span className={styles.chapterRowBody}>
                    <span className={styles.chapterRowTitle}>{chapter.title}</span>
                    <span className={styles.chapterRowMeta}>
                        <span><Clock size={12} /> {formatThaiRelativeTime(chapter.created_at)}</span>
                        <span><Eye size={12} /> {chapter.read_count.toLocaleString('th-TH')}</span>
                    </span>
                </span>
                {isLocked ? (
                    <span className={styles.chapterRowLockWrap}>
                        <span className={styles.chapterRowPrice}>{chapter.coin_price.toLocaleString('th-TH')} เหรียญ</span>
                        <span className={styles.chapterRowLockIcon}><Lock size={12} /></span>
                    </span>
                ) : (
                    <span className={styles.chapterRowArrow}><ChevronRight size={18} /></span>
                )}
            </button>
        );
    };

    if (dbStory.writing_style === 'chat') {
        return (
            <ChatStoryDetailsLayout
                storyId={storyId}
                story={dbStory}
                authorSummary={authorSummary}
                followerCount={effectiveFollowerCount}
                likeCount={likeCount}
                onBack={() => router.back()}
            />
        );
    }

    return (
        <main className={styles.main}>
            <SharedNavbar
                variant="case"
                user={user}
                isLoadingAuth={isLoadingAuth}
                coinBalance={coinBalance}
                unreadNotifCount={unreadNotifCount}
                isProfileMenuOpen={isProfileMenuOpen}
                profileMenuRef={profileMenuRef}
                onToggleProfileMenu={() => setIsProfileMenuOpen((prev) => !prev)}
                onCloseProfileMenu={() => setIsProfileMenuOpen(false)}
                onDashboardAccess={(event) => {
                    if (user) return;
                    event.preventDefault();
                    router.push(`/login?next=${encodeURIComponent('/dashboard')}`);
                }}
                onSignOut={handleSignOut}
                onOpenLogin={() => router.push(`/login?next=${encodeURIComponent(`/story/${storyId}`)}`)}
                lovesLabel="รักเลย"
            />

            <section className={styles.hero}>
                <div className={styles.heroBackdrop} style={{ backgroundImage: `url(${heroBackdrop})` }} />
                <div className={styles.heroShade} />
                <div className={styles.heroContent}>
                    <span className={styles.categoryPill}>{displayCategoryLabel}</span>
                    <h1 className={styles.heroTitle}>{dbStory.title}</h1>
                    <p className={styles.heroAuthor}>
                        โดย <Link href={authorProfileHref}>{dbStory.pen_name}</Link>
                    </p>
                    <div className={styles.heroMeta}>
                        <span className={styles.heroRating}>
                            <Star size={14} fill="currentColor" />
                            {ratingLabel}
                        </span>
                        <span>{totalChapters.toLocaleString('th-TH')} ตอน</span>
                        <span>{totalViews.toLocaleString('th-TH')} วิว</span>
                    </div>
                    <div className={styles.heroActionRow}>
                        <ShareButton
                            title={dbStory.title}
                            text={storyShareText}
                            urlPath={`/story/${storyId}`}
                            idleLabel="แชร์เรื่องนี้"
                            className={styles.heroShareButton}
                            sharedLabel="แชร์แล้ว"
                            copiedLabel="คัดลอกแล้ว"
                            errorLabel="ไม่สำเร็จ"
                        />
                    </div>
                </div>
            </section>

            <section className={styles.content}>
                <nav className={styles.tabs} aria-label="Story tabs">
                    <button
                        type="button"
                        className={`${styles.tabButton} ${activeTab === 'overview' ? styles.tabButtonActive : ''}`.trim()}
                        onClick={() => setActiveTab('overview')}
                    >
                        เรื่องย่อ
                    </button>
                    <button
                        type="button"
                        className={`${styles.tabButton} ${activeTab === 'chapters' ? styles.tabButtonActive : ''}`.trim()}
                        onClick={() => setActiveTab('chapters')}
                    >
                        รายการตอน
                    </button>
                    <button
                        type="button"
                        className={`${styles.tabButton} ${activeTab === 'comments' ? styles.tabButtonActive : ''}`.trim()}
                        onClick={() => setActiveTab('comments')}
                    >
                        ความคิดเห็น
                    </button>
                </nav>

                <div className={styles.tabContent}>
                    {activeTab === 'overview' && (
                        <div className={styles.overviewStack}>
                            <section className={styles.overviewCard}>
                                <div className={styles.overviewHead}>
                                    <h2>เรื่องย่อ</h2>
                                    <span>{readActionLabel}</span>
                                </div>
                                <p className={`${styles.synopsisText} ${!isSynopsisExpanded ? styles.synopsisCollapsed : ''}`.trim()}>
                                    {synopsisContent}
                                </p>
                                {hasSynopsisPreviewToggle && (
                                    <button
                                        type="button"
                                        className={styles.synopsisToggleButton}
                                        onClick={() => setIsSynopsisExpanded((prev) => !prev)}
                                    >
                                        {isSynopsisExpanded ? 'ย่อเรื่องย่อ' : 'อ่านต่อ'}
                                    </button>
                                )}
                                {metadataChips.length > 0 && (
                                    <div className={styles.tagList}>
                                        {metadataChips.map((tag) => (
                                            <span key={`tag-${tag}`} className={styles.tagChip}>#{tag}</span>
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section className={styles.promoCard}>
                                <div>
                                    <h3>สนับสนุนนักเขียนด้วยการอ่านต่อ</h3>
                                    <p>{actionNote}</p>
                                </div>
                                <Link href={readHref} className={styles.promoButton} onClick={persistStoryDetailReturnState}>
                                    ไปหน้าอ่าน
                                </Link>
                            </section>

                            <section className={styles.statsGrid}>
                                {statItems.map((item) => (
                                    <article key={item.label} className={styles.statCard}>
                                        <p>{item.label}</p>
                                        <strong className={item.tone === 'love' ? styles.statLove : item.tone === 'shelf' ? styles.statShelf : ''}>
                                            {item.value}
                                        </strong>
                                    </article>
                                ))}
                            </section>

                            <section className={styles.authorCard}>
                                <div className={styles.authorAvatar}>
                                    {resolvedAuthorSummary.avatarUrl ? (
                                        <img
                                            src={resolvedAuthorSummary.avatarUrl}
                                            alt={resolvedAuthorSummary.penName}
                                            className={styles.authorAvatarImage}
                                        />
                                    ) : (
                                        <span>{authorInitial}</span>
                                    )}
                                </div>
                                <div className={styles.authorBody}>
                                    <p className={styles.authorName}>{resolvedAuthorSummary.penName}</p>
                                    <p className={styles.authorBio}>
                                        {resolvedAuthorSummary.bio.trim() || 'นักเขียนยังไม่ได้เพิ่มคำแนะนำตัวเอง'}
                                    </p>
                                    <Link href={authorProfileHref} className={styles.authorLinkBtn}>
                                        ดูโปรไฟล์นักเขียน
                                    </Link>
                                </div>
                            </section>
                        </div>
                    )}

                    {activeTab === 'chapters' && (
                        <div className={styles.chapterListWrap}>
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
                                    className={styles.chapterToggleButton}
                                    onClick={() => setIsChapterListExpanded((prev) => !prev)}
                                >
                                    {isChapterListExpanded ? 'แสดงน้อยลง' : 'ดูตอนทั้งหมด'}
                                </button>
                            )}
                        </div>
                    )}

                    {activeTab === 'comments' && (
                        <div className={styles.commentWrap}>
                            <div className={styles.commentHead}>
                                <h3>{commentPreviewItems.length.toLocaleString('th-TH')} ความคิดเห็นล่าสุด</h3>
                                <span>ล่าสุด</span>
                            </div>
                            {commentPreviewItems.length === 0 ? (
                                <div className={styles.emptyState}>ยังไม่มีคอมเมนต์ในเรื่องนี้</div>
                            ) : (
                                <div className={styles.commentList}>
                                    {commentPreviewItems.map((comment) => (
                                        <article key={comment.id} className={styles.commentItem}>
                                            <div className={styles.commentAvatar}>
                                                {comment.avatarUrl ? (
                                                    <img src={comment.avatarUrl} alt={comment.penName} className={styles.commentAvatarImage} />
                                                ) : (
                                                    <span>{comment.penName.trim().charAt(0).toUpperCase() || 'U'}</span>
                                                )}
                                            </div>
                                            <div className={styles.commentBody}>
                                                <p className={styles.commentMeta}>
                                                    <strong>{comment.penName}</strong>
                                                    <span>{formatThaiRelativeTime(comment.createdAt)}</span>
                                                </p>
                                                <p className={styles.commentText}>{comment.content}</p>
                                                <div className={styles.commentActions}>
                                                    <Link
                                                        href={`/story/${storyId}/read`}
                                                        className={styles.commentReplyButton}
                                                        onClick={persistStoryDetailReturnState}
                                                    >
                                                        <MessageCircle size={12} />
                                                        ตอบกลับ
                                                    </Link>
                                                </div>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </section>

            <footer className={styles.bottomBar}>
                <button
                    type="button"
                    className={`${styles.likeButton} ${isLiked ? styles.likeButtonActive : ''}`.trim()}
                    onClick={handleToggleLike}
                    disabled={isLikePending}
                    aria-label="กดเลิฟ"
                >
                    <Heart size={22} fill={isLiked ? 'currentColor' : 'none'} />
                </button>

                <button
                    type="button"
                    className={styles.shelfButton}
                    onClick={toggleFollow}
                    disabled={isStoryOwner || isFollowLoading}
                >
                    <BookOpen size={18} />
                    {isStoryOwner ? 'เรื่องของคุณ' : effectiveIsFollowing ? 'อยู่ในชั้นแล้ว' : 'เพิ่มเข้าชั้น'}
                </button>

                <Link
                    href={readHref}
                    className={`${styles.readButton} ${dbChapters.length === 0 ? styles.readButtonDisabled : ''}`.trim()}
                    onClick={(event) => {
                        if (dbChapters.length === 0) {
                            event.preventDefault();
                            return;
                        }
                        persistStoryDetailReturnState();
                    }}
                >
                    <Eye size={18} />
                    {readActionLabelMain}
                </Link>
            </footer>

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
