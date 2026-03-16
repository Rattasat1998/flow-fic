'use client';

import { useState, useEffect, use, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { FEATURE_FLAGS } from '@/lib/featureFlags';
import { PlaySquare, UserPlus, UserCheck, Coins } from 'lucide-react';
import styles from './details.module.css';
import { useTracking } from '@/hooks/useTracking';
import { useFollow } from '@/hooks/useFollow';
import { useAuth } from '@/contexts/AuthContext';

interface StoryDetailsProps {
    params: Promise<{ id: string }>;
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

type StoryDetailCacheEntry = {
    story: DBStory;
    chapters: DBChapter[];
    likeCount: number;
    coinBalance: number;
    followerCount: number;
    isFollowing: boolean;
    updatedAt: string;
};

const fallbackCover = 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=600&q=80';
const BRANCHING_FEATURE_ENABLED = FEATURE_FLAGS.branching;
const STORY_DETAIL_CACHE_PREFIX = 'flowfic:story-detail';
const STORY_DETAIL_SCROLL_PREFIX = 'flowfic:story-detail-scroll';
const useClientLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const getStoryDetailCacheKey = (storyId: string, userId?: string | null) =>
    `${STORY_DETAIL_CACHE_PREFIX}:${userId || 'guest'}:${storyId}`;

const getStoryDetailScrollKey = (storyId: string, userId?: string | null) =>
    `${STORY_DETAIL_SCROLL_PREFIX}:${userId || 'guest'}:${storyId}`;

const readStoryDetailCache = (storyId: string, userId?: string | null): StoryDetailCacheEntry | null => {
    if (typeof window === 'undefined') return null;

    try {
        const raw = sessionStorage.getItem(getStoryDetailCacheKey(storyId, userId));
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<StoryDetailCacheEntry>;
        if (!parsed || typeof parsed !== 'object' || !parsed.story || !Array.isArray(parsed.chapters)) {
            return null;
        }

        return {
            story: parsed.story as DBStory,
            chapters: parsed.chapters as DBChapter[],
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

const writeStoryDetailCache = (storyId: string, userId: string | null | undefined, cache: StoryDetailCacheEntry) => {
    if (typeof window === 'undefined') return;

    try {
        sessionStorage.setItem(getStoryDetailCacheKey(storyId, userId), JSON.stringify(cache));
    } catch {
        // Ignore storage quota / private mode failures
    }
};

export default function StoryDetailsPage({ params }: StoryDetailsProps) {
    const unwrappedParams = use(params);
    const storyId = unwrappedParams.id;
    const router = useRouter();

    useTracking({ autoPageView: true, pagePath: `/story/${storyId}`, storyId });
    const { user } = useAuth();
    const userId = user?.id ?? null;
    const detailCacheKey = useMemo(() => getStoryDetailCacheKey(storyId, userId), [storyId, userId]);
    const detailScrollKey = useMemo(() => getStoryDetailScrollKey(storyId, userId), [storyId, userId]);

    const [isLoading, setIsLoading] = useState(true);
    const [dbStory, setDbStory] = useState<DBStory | null>(null);
    const [dbChapters, setDbChapters] = useState<DBChapter[]>([]);
    const [likeCount, setLikeCount] = useState(0);
    const [loadError, setLoadError] = useState('');
    const [hydratedCache, setHydratedCache] = useState<StoryDetailCacheEntry | null>(null);
    const hasRestoredScrollRef = useRef(false);

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

    useClientLayoutEffect(() => {
        hasRestoredScrollRef.current = false;
        setLoadError('');

        const cached = readStoryDetailCache(storyId, userId);
        setHydratedCache(cached);

        if (!cached) {
            setDbStory(null);
            setDbChapters([]);
            setLikeCount(0);
            setCoinBalance(0);
            setIsLoading(true);
            return;
        }

        setDbStory(cached.story);
        setDbChapters(cached.chapters);
        setLikeCount(cached.likeCount);
        setCoinBalance(cached.coinBalance);
        setIsLoading(false);
    }, [detailCacheKey, storyId, userId]);

    const persistStoryDetailSnapshot = useCallback(() => {
        if (!dbStory) return;

        const nextCache: StoryDetailCacheEntry = {
            story: dbStory,
            chapters: dbChapters,
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
    }, [persistStoryDetailSnapshot, saveStoryDetailScrollPosition]);

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
        if (isLoading || !dbStory || hasRestoredScrollRef.current) return;

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
    }, [detailScrollKey, isLoading, dbStory]);

    useEffect(() => {
        let cancelled = false;

        const fetchStoryDetails = async () => {
            const hasCachedSnapshot = hasHydratedCache;
            if (!hasCachedSnapshot) {
                setIsLoading(true);
            }
            setLoadError('');

            const { data: storyData, error: storyError } = await supabase
                .from('stories')
                .select('*')
                .eq('id', storyId)
                .eq('status', 'published')
                .single();

            if (cancelled) return;

            if (storyError || !storyData) {
                if (!hasCachedSnapshot) {
                    setDbStory(null);
                    setDbChapters([]);
                    setLikeCount(0);
                    setCoinBalance(0);
                    setLoadError('ไม่พบข้อมูลเรื่อง');
                    setIsLoading(false);
                }
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
            if (userId) {
                const { data: walletData } = await supabase
                    .from('wallets')
                    .select('coin_balance')
                    .eq('user_id', userId)
                    .maybeSingle();
                nextCoinBalance = walletData?.coin_balance || 0;

                // Check which chapters the user has actually unlocked (paid for)
                const { data: unlockRows } = await supabase
                    .from('chapter_unlocks')
                    .select('chapter_id')
                    .eq('user_id', userId)
                    .eq('story_id', storyId);

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

            setDbStory(storyData as DBStory);
            setDbChapters(chapterData as DBChapter[] || []);
            setLikeCount(likesCount || 0);
            setIsLoading(false);
        };

        void fetchStoryDetails();
        return () => {
            cancelled = true;
        };
    }, [storyId, userId, hasHydratedCache]);

    // Auto-dismiss toast
    useEffect(() => {
        if (!coinToast) return;
        const timer = setTimeout(() => setCoinToast(null), 2500);
        return () => clearTimeout(timer);
    }, [coinToast]);

    const isStoryOwner = !!user && dbStory?.user_id === user.id;

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
            <main className={styles.main} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p>กำลังโหลดข้อมูล...</p>
            </main>
        );
    }

    if (!dbStory) {
        return (
            <main className={styles.main} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                <h2>{loadError || 'ไม่พบข้อมูลเรื่อง'}</h2>
            </main>
        );
    }

    const totalViews = dbChapters.reduce((sum, ch) => sum + ch.read_count, 0);
    const totalChapters = dbChapters.length;
    const cover = dbStory.cover_url || fallbackCover;
    const isBranchingStory = BRANCHING_FEATURE_ENABLED && dbStory.path_mode === 'branching';
    const entryChapterId = dbStory.entry_chapter_id || dbChapters[0]?.id || null;
    const readHref = isBranchingStory && entryChapterId
        ? `/story/${storyId}/read?chapterId=${entryChapterId}`
        : `/story/${storyId}/read`;
    const storyTypeLabel = dbStory.category === 'fanfic' ? 'แฟนฟิค' : 'ออริจินัล';
    const completionLabel = dbStory.completion_status === 'completed' ? 'จบแล้ว' : 'ยังไม่จบ';
    const publicationLabel = dbStory.status === 'published' ? 'เผยแพร่แล้ว' : 'แบบร่าง';
    const displayChapters = isBranchingStory
        ? dbChapters.filter((chapter) => chapter.id === entryChapterId || (entryChapterId === null && dbChapters.indexOf(chapter) === 0))
        : dbChapters;
    const startChapter = displayChapters[0] || null;
    const showFollowButton = !isStoryOwner;
    const summaryItems = [
        { label: 'ประเภท', value: storyTypeLabel },
        { label: 'สถานะเรื่อง', value: completionLabel },
        { label: 'จำนวนตอน', value: `${totalChapters} ตอน` },
        { label: 'ยอดอ่าน', value: `${totalViews.toLocaleString('th-TH')} ครั้ง` },
        { label: 'ถูกใจ', value: `${likeCount.toLocaleString('th-TH')} ครั้ง` },
        { label: 'ติดตาม', value: `${effectiveFollowerCount.toLocaleString('th-TH')} คน` },
    ];
    const chapterSectionTitle = isBranchingStory ? 'จุดเริ่มอ่าน' : `สารบัญตอน (${totalChapters})`;
    const chapterSectionMeta = isBranchingStory
        ? 'เริ่มจาก entry chapter ของเรื่อง แล้วเลือกเส้นทางระหว่างอ่าน'
        : 'แสดงเฉพาะตอนที่เผยแพร่แล้ว';
    const actionNote = dbChapters.length > 0
        ? isBranchingStory && startChapter
            ? `เริ่มที่ตอน ${String(startChapter.order_index + 1).padStart(2, '0')} แล้วเลือกเส้นทางต่อระหว่างอ่าน`
            : `เผยแพร่แล้ว ${totalChapters} ตอน`
        : 'เรื่องนี้ยังไม่มีตอนที่เผยแพร่';

    const renderChapterItem = (chapter: DBChapter) => {
        const isPremium = chapter.is_premium && chapter.coin_price > 0;
        const isAccessiblePremium = isPremium && chapter.can_read;
        const premiumStatusLabel = !isPremium
            ? null
            : !chapter.can_read
                ? `${chapter.coin_price.toLocaleString('th-TH')} เหรียญ`
                : chapter.access_source === 'unlock'
                    ? 'ปลดล็อกแล้ว'
                    : chapter.access_source === 'vip'
                        ? 'อ่านได้ด้วย VIP'
                        : chapter.access_source === 'owner'
                            ? 'ตอนพิเศษ'
                            : 'อ่านได้แล้ว';
        const premiumStatusClass = !isPremium
            ? ''
            : isAccessiblePremium
                ? styles.chapterStatusAccessible
                : styles.chapterStatusPremium;
        const chapterActionLabel = !isPremium || chapter.can_read
            ? 'อ่านตอน'
            : `ปลดล็อก ${chapter.coin_price.toLocaleString('th-TH')}`;

        return (
            <button
                key={chapter.id}
                type="button"
                className={styles.chapterItem}
                onClick={() => handleChapterClick(chapter, dbChapters.indexOf(chapter))}
            >
                <span className={styles.chapterNumber}>
                    {String(chapter.order_index + 1).padStart(2, '0')}
                </span>
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
                        <span>{chapter.read_count.toLocaleString('th-TH')} วิว</span>
                        <span>{new Date(chapter.created_at).toLocaleDateString('th-TH')}</span>
                        {isBranchingStory && startChapter?.id === chapter.id && (
                            <span className={styles.chapterMetaAccent}>จุดเริ่มต้นของเรื่อง</span>
                        )}
                    </span>
                </span>
                <span className={styles.chapterAction}>{chapterActionLabel}</span>
            </button>
        );
    };

    return (
        <main className={styles.main}>
            <section className={styles.masthead}>
                <div className={styles.mastheadInner}>
                    <div className={styles.coverColumn}>
                        <div className={styles.coverFrame}>
                            <img src={cover} alt={dbStory.title} className={styles.coverImage} />
                        </div>
                    </div>
                    <div className={styles.mastheadBody}>
                        <div className={styles.storyEyebrow}>
                            <span>{storyTypeLabel}</span>
                            <span className={styles.storyEyebrowDivider}>โดย</span>
                            <span>{dbStory.pen_name}</span>
                            {isBranchingStory && (
                                <span className={styles.pathModePill}>เลือกเส้นทาง</span>
                            )}
                        </div>
                        <h1 className={styles.storyTitle}>{dbStory.title}</h1>
                        <div className={styles.storyStateRow}>
                            <span className={styles.storyState}>{completionLabel}</span>
                            <span className={styles.storyStateMuted}>{publicationLabel}</span>
                        </div>
                        <div className={styles.actionRow}>
                            <Link
                                href={readHref}
                                className={styles.primaryActionBtn}
                                onClick={persistStoryDetailReturnState}
                            >
                                <PlaySquare size={18} fill="currentColor" />
                                {dbChapters.length > 0 ? (isBranchingStory ? 'เริ่มจากจุดเริ่มต้น' : 'เริ่มอ่านตอนแรก') : 'อ่านเลย'}
                            </Link>
                            {showFollowButton && (
                                <button
                                    className={`${styles.followBtn} ${effectiveIsFollowing ? styles.followBtnActive : ''}`}
                                    onClick={toggleFollow}
                                    disabled={isFollowLoading}
                                >
                                    {effectiveIsFollowing ? <UserCheck size={18} /> : <UserPlus size={18} />}
                                    {effectiveIsFollowing ? 'กำลังติดตาม' : 'ติดตามเรื่องนี้'}
                                </button>
                            )}
                        </div>
                        <p className={styles.actionNote}>{actionNote}</p>
                    </div>
                </div>
            </section>

            <section className={styles.summaryStrip}>
                {summaryItems.map((item) => (
                    <div key={item.label} className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>{item.label}</span>
                        <strong className={styles.summaryValue}>{item.value}</strong>
                    </div>
                ))}
            </section>

            <div className={styles.contentWrapper}>
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>เรื่องย่อ</h2>
                    </div>
                    <p className={styles.synopsisText}>{dbStory.synopsis || 'ไม่มีคำโปรยสำหรับเรื่องนี้'}</p>
                </section>

                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>{chapterSectionTitle}</h2>
                        <span className={styles.sectionMeta}>{chapterSectionMeta}</span>
                    </div>
                    {displayChapters.length === 0 ? (
                        <div className={styles.emptyState}>เรื่องนี้ยังไม่มีตอนที่เผยแพร่</div>
                    ) : (
                        <>
                            {isBranchingStory && startChapter && (
                                <div className={styles.startCallout}>
                                    <span className={styles.startCalloutLabel}>เริ่มจากตอนนี้</span>
                                    <strong className={styles.startCalloutTitle}>
                                        ตอน {String(startChapter.order_index + 1).padStart(2, '0')} · {startChapter.title}
                                    </strong>
                                    <p className={styles.startCalloutText}>
                                        เมื่อเข้าไปอ่าน ผู้อ่านจะเลือกเส้นทางต่อจากตอนนี้ระหว่างเรื่อง
                                    </p>
                                </div>
                            )}

                            <div className={styles.chapterList}>
                                {displayChapters.map((chapter) => renderChapterItem(chapter))}
                            </div>
                        </>
                    )}
                </section>
            </div>

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
