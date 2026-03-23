'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bookmark, Heart } from 'lucide-react';

import { SharedNavbar } from '@/components/navigation/SharedNavbar';
import { StoryMediumCard } from '@/components/story/StoryMediumCard';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

import styles from './ReaderLibraryPage.module.css';

type ReaderLibraryKind = 'bookshelf' | 'loves';
type ReaderLibrarySource = 'favorites' | 'likes';
type ReaderLibraryWritingStyle = 'narrative' | 'chat' | 'thread' | 'visual_novel';
type ReaderLibraryCategory = 'novel' | 'fanfic' | 'cartoon';

type ReaderLibraryStory = {
    id: string;
    title: string;
    coverUrl: string;
    penName: string;
    chapterReadIndex: number;
    writingStyle: ReaderLibraryWritingStyle;
    category: ReaderLibraryCategory;
    completionStatus: string;
};

type ReaderLibraryRow = {
    id: string;
    story_id: string;
    chapter_id: string | null;
    created_at: string;
};

type ReaderLibraryStoryRow = {
    id: string;
    title: string;
    cover_url: string | null;
    cover_wide_url: string | null;
    pen_name: string;
    writing_style: string | null;
    category: string | null;
    completion_status: string | null;
    status: string | null;
};

type ReaderChapterMetaRow = {
    id: string;
    title: string | null;
    order_index: number;
};

type ReaderLibraryConfig = {
    source: ReaderLibrarySource;
    title: string;
    eyebrow: string;
    subtitle: (count: number) => string;
    sectionTitle: string;
    sectionDescription: string;
    emptyTitle: string;
    emptyDescription: string;
    loadingLabel: string;
    removeLabel: string;
    ctaLabel: string;
    accent: 'bookshelf' | 'loves';
};

const READER_LIBRARY_CONFIG: Record<ReaderLibraryKind, ReaderLibraryConfig> = {
    bookshelf: {
        source: 'favorites',
        title: 'ชั้นหนังสือของฉัน',
        eyebrow: 'Reader Bookshelf',
        subtitle: (count) => `เรื่องที่คุณเก็บไว้อ่าน${count > 0 ? ` (${count} เรื่อง)` : ''}`,
        sectionTitle: 'เรื่องที่คุณเก็บไว้อ่านต่อ',
        sectionDescription: 'เรียงจากเรื่องที่คุณเพิ่งบันทึกล่าสุดในคลังอ่านส่วนตัว',
        emptyTitle: 'ยังไม่มีเรื่องในชั้นหนังสือ',
        emptyDescription: 'กดปุ่มบันทึกในหน้าอ่านเรื่องเพื่อเก็บเรื่องที่อยากกลับมาอ่านไว้อีกครั้ง',
        loadingLabel: 'กำลังโหลดชั้นหนังสือ...',
        removeLabel: 'นำออกจากชั้นหนังสือ',
        ctaLabel: 'ไปดูเรื่องน่าอ่าน',
        accent: 'bookshelf',
    },
    loves: {
        source: 'likes',
        title: 'รักเลยของฉัน',
        eyebrow: 'Reader Favorites',
        subtitle: (count) => `เรื่องที่คุณกดหัวใจ${count > 0 ? ` (${count} เรื่อง)` : ''}`,
        sectionTitle: 'รายการรักเลยที่คุณอยากกลับมาเปิดอีกครั้ง',
        sectionDescription: 'เรียงจากเรื่องที่คุณเพิ่งกดหัวใจล่าสุดในคลังอ่านส่วนตัว',
        emptyTitle: 'ยังไม่มีเรื่องที่คุณกดหัวใจ',
        emptyDescription: 'เมื่อเจอเรื่องที่ชอบ กดหัวใจไว้แล้วรายการรักเลยจะกลับมาให้คุณได้หยิบอ่านต่อจากหน้านี้',
        loadingLabel: 'กำลังโหลดรายการรักเลย...',
        removeLabel: 'ยกเลิกรัก',
        ctaLabel: 'ไปดูเรื่องน่าอ่าน',
        accent: 'loves',
    },
};

const normalizeCategory = (cat?: string | null): ReaderLibraryCategory => {
    if (cat === 'fanfic' || cat === 'cartoon') return cat;
    return 'novel';
};

const normalizeWritingStyle = (style?: string | null): ReaderLibraryWritingStyle => {
    if (style === 'chat' || style === 'thread' || style === 'visual_novel') return style;
    return 'narrative';
};

const categoryLabel = (cat: ReaderLibraryCategory) => {
    switch (cat) {
        case 'fanfic': return 'แฟนฟิค';
        case 'cartoon': return 'การ์ตูน';
        default: return 'นิยาย';
    }
};

const writingStyleLabel = (style: ReaderLibraryWritingStyle) => {
    switch (style) {
        case 'chat': return 'แชท';
        case 'thread': return 'เธรด';
        case 'visual_novel': return 'วิชวลโนเวล';
        default: return 'บรรยาย';
    }
};

export function ReaderLibraryPage({ kind }: { kind: ReaderLibraryKind }) {
    const router = useRouter();
    const { user, isLoading: isLoadingAuth, signOut } = useAuth();
    const userId = user?.id ?? null;
    const config = READER_LIBRARY_CONFIG[kind];
    const Icon = kind === 'bookshelf' ? Bookmark : Heart;

    const [stories, setStories] = useState<ReaderLibraryStory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef<HTMLDivElement>(null);
    const [walletCoinBalance, setWalletCoinBalance] = useState<number | null>(null);
    const [unreadNotifCount, setUnreadNotifCount] = useState(0);

    useEffect(() => {
        if (!userId) return;

        const fetchUnread = async () => {
            const { count } = await supabase
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('is_read', false);

            setUnreadNotifCount(count || 0);
        };

        void fetchUnread();
    }, [userId]);

    useEffect(() => {
        if (!userId) return;

        const fetchWalletBalance = async () => {
            const { data } = await supabase
                .from('wallets')
                .select('coin_balance')
                .eq('user_id', userId)
                .maybeSingle();

            setWalletCoinBalance(typeof data?.coin_balance === 'number' ? data.coin_balance : 0);
        };

        void fetchWalletBalance();
    }, [userId]);

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
        if (isLoadingAuth) return;
        if (!userId) {
            router.push('/');
            return;
        }

        const fetchStories = async () => {
            setIsLoading(true);

            const { data: rawLibraryRows, error } = await supabase
                .from(config.source)
                .select('id, story_id, chapter_id, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            const libraryRows = (rawLibraryRows as ReaderLibraryRow[] | null) || [];
            if (error || libraryRows.length === 0) {
                setStories([]);
                setIsLoading(false);
                return;
            }

            const uniqueLibraryRows: ReaderLibraryRow[] = [];
            const seenStoryIds = new Set<string>();
            libraryRows.forEach((row) => {
                if (seenStoryIds.has(row.story_id)) return;
                seenStoryIds.add(row.story_id);
                uniqueLibraryRows.push(row);
            });

            const storyIds = uniqueLibraryRows.map((row) => row.story_id);
            const { data: rawStoryRows } = await supabase
                .from('stories')
                .select('id, title, cover_url, cover_wide_url, pen_name, writing_style, category, completion_status, status')
                .in('id', storyIds)
                .eq('status', 'published');

            const storyRows = (rawStoryRows as ReaderLibraryStoryRow[] | null) || [];
            if (storyRows.length === 0) {
                setStories([]);
                setIsLoading(false);
                return;
            }

            const chapterRpcResults = await Promise.all(
                storyIds.map(async (storyId) => {
                    const { data, error: chapterError } = await supabase.rpc('get_reader_chapters', {
                        p_story_id: storyId,
                        p_preview_mode: false,
                        p_preview_chapter_id: null,
                    });

                    if (chapterError) {
                        return { storyId, rows: [] as ReaderChapterMetaRow[] };
                    }

                    const rows = ((data as ReaderChapterMetaRow[] | null) || [])
                        .slice()
                        .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
                    return { storyId, rows };
                })
            );

            const chapterMetaById = new Map<string, { title: string; readIndex: number }>();
            chapterRpcResults.forEach(({ rows }) => {
                rows.forEach((chapter, index) => {
                    chapterMetaById.set(chapter.id, {
                        title: chapter.title || 'ไม่มีชื่อ',
                        readIndex: index,
                    });
                });
            });

            const storyMap = new Map(storyRows.map((story) => [story.id, story]));
            const mergedStories: ReaderLibraryStory[] = [];

            uniqueLibraryRows.forEach((row) => {
                const story = storyMap.get(row.story_id);
                if (!story) return;

                const chapterMeta = row.chapter_id ? chapterMetaById.get(row.chapter_id) : null;
                mergedStories.push({
                    id: story.id,
                    title: story.title,
                    coverUrl:
                        story.cover_url ||
                        story.cover_wide_url ||
                        'https://images.unsplash.com/photo-1518621736915-f3b1c41bfd00?auto=format&fit=crop&w=800&q=80',
                    penName: story.pen_name,
                    chapterReadIndex: chapterMeta?.readIndex ?? 0,
                    writingStyle: normalizeWritingStyle(story.writing_style),
                    category: normalizeCategory(story.category),
                    completionStatus: story.completion_status || 'ongoing',
                });
            });

            setStories(mergedStories);
            setIsLoading(false);
        };

        void fetchStories();
    }, [config.source, isLoadingAuth, router, userId]);

    const handleRemoveStory = useCallback(async (storyId: string) => {
        if (!user) return;

        setRemovingId(storyId);
        const { error } = await supabase
            .from(config.source)
            .delete()
            .eq('user_id', user.id)
            .eq('story_id', storyId);

        if (!error) {
            setStories((prev) => prev.filter((story) => story.id !== storyId));
        }

        setRemovingId(null);
    }, [config.source, user]);

    const handleDashboardAccess = useCallback((event: ReactMouseEvent<HTMLAnchorElement>) => {
        if (typeof window !== 'undefined' && window.location.pathname === '/dashboard') {
            event.preventDefault();
        }
        setIsProfileMenuOpen(false);
    }, []);

    const handleOpenLogin = useCallback(() => {
        router.push('/');
    }, [router]);

    const handleSignOut = useCallback(async () => {
        try {
            setIsProfileMenuOpen(false);
            await signOut();
            router.push('/');
        } catch (error) {
            console.error('[ReaderLibraryPage] Sign out failed:', error);
            alert('ออกจากระบบไม่สำเร็จ กรุณาลองใหม่');
        }
    }, [router, signOut]);

    const cardNodes = useMemo(
        () => stories.map((story) => (
            <StoryMediumCard
                key={story.id}
                href={`/story/${story.id}/read`}
                coverUrl={story.coverUrl}
                title={story.title}
                author={story.penName}
                tags={[writingStyleLabel(story.writingStyle), categoryLabel(story.category)]}
                isCompleted={story.completionStatus === 'completed'}
                onRemove={() => handleRemoveStory(story.id)}
                removeLabel={config.removeLabel}
                removeDisabled={removingId === story.id}
                accent={config.accent}
                imageSizes="(max-width: 720px) 44vw, 180px"
            />
        )),
        [config.accent, config.removeLabel, handleRemoveStory, removingId, stories]
    );

    if (!isLoadingAuth && !user) {
        return null;
    }

    const headerClassName = [
        styles.pageHeader,
        config.accent === 'bookshelf' ? styles.pageHeaderBookshelf : styles.pageHeaderLoves,
    ].join(' ');
    const headerIconClassName = [
        styles.headerIcon,
        config.accent === 'bookshelf' ? styles.headerIconBookshelf : styles.headerIconLoves,
    ].join(' ');
    const headerMetaClassName = [
        styles.headerMeta,
        config.accent === 'bookshelf' ? styles.headerMetaBookshelf : styles.headerMetaLoves,
    ].join(' ');
    const stateIconClassName = [
        styles.stateIcon,
        config.accent === 'bookshelf' ? styles.stateIconBookshelf : styles.stateIconLoves,
    ].join(' ');

    return (
        <main className={styles.main}>
            <SharedNavbar
                user={user}
                isLoadingAuth={isLoadingAuth}
                coinBalance={walletCoinBalance}
                unreadNotifCount={unreadNotifCount}
                onDashboardAccess={handleDashboardAccess}
                isProfileMenuOpen={isProfileMenuOpen}
                profileMenuRef={profileMenuRef}
                onToggleProfileMenu={() => setIsProfileMenuOpen((prev) => !prev)}
                onCloseProfileMenu={() => setIsProfileMenuOpen(false)}
                onOpenLogin={handleOpenLogin}
                onSignOut={handleSignOut}
                lovesLabel="รักเลย"
            />

            <div className={`ffPageContainer ${styles.pageShell}`}>
                <section className={headerClassName}>
                    <div className={styles.pageHeaderBody}>
                        <div className={headerIconClassName}>
                            <Icon size={28} />
                        </div>
                        <div>
                            <span className={styles.eyebrow}>{config.eyebrow}</span>
                            <h1 className={styles.heading}>{config.title}</h1>
                            <p className={styles.subheading}>{config.subtitle(stories.length)}</p>
                        </div>
                    </div>
                    <div className={headerMetaClassName}>
                        ทั้งหมด {stories.length.toLocaleString('th-TH')} เรื่อง
                    </div>
                </section>

                <section className={styles.content}>
                    {isLoadingAuth || isLoading ? (
                        <div className={styles.stateCard}>
                            <div className={stateIconClassName}>
                                <Icon size={34} />
                            </div>
                            <h2 className={styles.stateTitle}>{config.loadingLabel}</h2>
                            <p className={styles.stateDescription}>ระบบกำลังเตรียมรายการของคุณจากคลังอ่านส่วนตัว</p>
                        </div>
                    ) : stories.length === 0 ? (
                        <div className={styles.stateCard}>
                            <div className={stateIconClassName}>
                                <Icon size={34} />
                            </div>
                            <h2 className={styles.stateTitle}>{config.emptyTitle}</h2>
                            <p className={styles.stateDescription}>{config.emptyDescription}</p>
                            <Link href="/" className={styles.stateAction}>
                                {config.ctaLabel}
                            </Link>
                        </div>
                    ) : (
                        <div className={styles.librarySurface}>
                            <div className={styles.surfaceHeader}>
                                <div>
                                    <h2 className={styles.surfaceTitle}>{config.sectionTitle}</h2>
                                    <p className={styles.surfaceMeta}>{config.sectionDescription}</p>
                                </div>
                                <span className={styles.surfaceCount}>{stories.length.toLocaleString('th-TH')} เรื่อง</span>
                            </div>
                            <div className={styles.gridStage}>{cardNodes}</div>
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
