'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { PlaySquare, UserPlus, UserCheck } from 'lucide-react';
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
    synopsis: string;
    cover_url: string | null;
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

const fallbackCover = 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=600&q=80';

export default function StoryDetailsPage({ params }: StoryDetailsProps) {
    const unwrappedParams = use(params);
    const storyId = unwrappedParams.id;

    useTracking({ autoPageView: true, pagePath: `/story/${storyId}`, storyId });
    const { user } = useAuth();

    const [isLoading, setIsLoading] = useState(true);
    const [dbStory, setDbStory] = useState<DBStory | null>(null);
    const [dbChapters, setDbChapters] = useState<DBChapter[]>([]);
    const [likeCount, setLikeCount] = useState(0);

    const { isFollowing, followerCount, toggleFollow, isLoading: isFollowLoading } = useFollow({
        storyId,
        userId: user?.id,
    });

    useEffect(() => {
        const fetchStoryDetails = async () => {
            setIsLoading(true);

            const { data: storyData, error: storyError } = await supabase
                .from('stories')
                .select('*')
                .eq('id', storyId)
                .eq('status', 'published')
                .single();

            if (storyError || !storyData) {
                setIsLoading(false);
                return;
            }

            const { data: chapterRows, error: chapterRowsError } = await supabase.rpc('get_reader_chapters', {
                p_story_id: storyId,
                p_preview_mode: false,
                p_preview_chapter_id: null,
            });

            if (chapterRowsError) {
                setIsLoading(false);
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
            }));

            // Fetch like count
            const { count: likesCount } = await supabase
                .from('likes')
                .select('*', { count: 'exact', head: true })
                .eq('story_id', storyId);

            setDbStory(storyData as DBStory);
            setDbChapters(chapterData as DBChapter[] || []);
            setLikeCount(likesCount || 0);
            setIsLoading(false);
        };

        fetchStoryDetails();
    }, [storyId]);

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
                <h2>ไม่พบข้อมูลเรื่อง</h2>
            </main>
        );
    }

    const totalViews = dbChapters.reduce((sum, ch) => sum + ch.read_count, 0);
    const totalChapters = dbChapters.length;
    const cover = dbStory.cover_url || fallbackCover;

    return (
        <main className={styles.main}>
            <div className={styles.heroBanner}>
                <div className={styles.heroBg} style={{ backgroundImage: `url(${cover})` }} />
                <div className={styles.heroOverlay}>
                    <nav className={styles.topNavigation}>
                    </nav>

                    <div className={styles.heroContent}>
                        <div className={styles.heroPosterContainer}>
                            <img src={cover} alt={dbStory.title} className={styles.heroPoster} />
                        </div>

                        <div className={styles.heroDetails}>
                            <h1 className={styles.heroTitle}>{dbStory.title}</h1>
                            <div className={styles.heroMeta}>
                                {dbStory.category === 'fanfic' ? 'Fanfiction' : 'Original'} <span className={styles.heroMetaDivider}>·</span> {dbStory.pen_name}
                            </div>

                            <p className={styles.heroSubtitle}>
                                {dbStory.synopsis || 'ไม่มีคำโปรยสำหรับเรื่องนี้'}
                            </p>

                            <div className={styles.heroBadges}>
                                <span className={styles.badge + ' ' + styles.badgeDark}>
                                    {dbStory.category === 'fanfic' ? 'ออริจินัลฟิค' : 'ออริจินัล'}
                                </span>
                                <span className={styles.badge + ' ' + (dbStory.completion_status === 'completed' ? styles.badgeScore : styles.badgeActive)}>
                                    {dbStory.completion_status === 'completed' ? 'จบแล้ว' : 'กำลังออนแอร์'}
                                </span>
                                <span className={styles.badge + ' ' + styles.badgeDark}>
                                    👁️ {totalViews.toLocaleString()} Views
                                </span>
                                <span className={styles.badge + ' ' + styles.badgeDark}>
                                    ❤️ {likeCount.toLocaleString()} Loves
                                </span>
                                <span className={styles.badge + ' ' + styles.badgeDark}>
                                    👥 {followerCount.toLocaleString()} ติดตาม
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles.contentWrapper}>
                <aside className={styles.leftSidebar}>
                    <div className={styles.readBtnArea}>
                        <Link href={`/story/${storyId}/read?chapter=0`} className={styles.primaryActionBtn}>
                            <PlaySquare size={20} fill="currentColor" />
                            {dbChapters.length > 0 ? 'เริ่มอ่านตอนแรก' : 'อ่านเลย'}
                        </Link>
                        {(!dbStory.user_id || dbStory.user_id !== user?.id) && (
                            <button
                                className={`${styles.followBtn} ${isFollowing ? styles.followBtnActive : ''}`}
                                onClick={toggleFollow}
                                disabled={isFollowLoading}
                            >
                                {isFollowing ? <UserCheck size={18} /> : <UserPlus size={18} />}
                                {isFollowing ? 'กำลังติดตาม' : 'ติดตามเรื่องนี้'}
                            </button>
                        )}
                    </div>

                    <div className={styles.infoBlock}>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>สถานะการเผยแพร่</span>
                            <span className={styles.infoValue}>{dbStory.status === 'published' ? 'เผยแพร่แล้ว' : 'แบบร่าง'}</span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>สถานะความสมบูรณ์</span>
                            <span className={styles.infoValue}>{dbStory.completion_status === 'completed' ? 'จบแล้ว' : 'ยังไม่จบ'}</span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>จำนวนตอนทั้งหมด</span>
                            <span className={styles.infoValue}>{totalChapters} ตอน</span>
                        </div>
                    </div>
                </aside>

                <div className={styles.mainContent}>
                    <section className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <h2 className={styles.sectionTitle}>คำโปรย (Synopsis)</h2>
                        </div>
                        <p className={styles.synopsisText}>{dbStory.synopsis || 'ไม่มีคำโปรยสำหรับเรื่องนี้'}</p>
                    </section>

                    <section className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <h2 className={styles.sectionTitle}>
                                สารบัญตอน ({totalChapters})
                            </h2>
                        </div>
                        <div className={styles.chapterList}>
                            {dbChapters.length === 0 ? (
                                <div className={styles.emptyState}>เรื่องนี้ยังไม่มีตอนที่เผยแพร่</div>
                            ) : (
                                dbChapters.map((chapter, index) => (
                                    <Link href={`/story/${storyId}/read?chapter=${index}`} key={chapter.id} className={styles.chapterItem}>
                                        <div>
                                            <div className={styles.chapterTitle}>{chapter.title}</div>
                                            <div className={styles.chapterMeta} style={{ marginTop: '0.25rem' }}>
                                                <span>👁️ {chapter.read_count} วิว</span>
                                                <span>📅 {new Date(chapter.created_at).toLocaleDateString('th-TH')}</span>
                                                {chapter.is_premium && (
                                                    <span style={{ color: '#b45309', fontWeight: 700 }}>
                                                        🔒 ตอนพิเศษ {chapter.coin_price} เหรียญ
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <span className={styles.chapterAction}>{chapter.is_premium ? 'ดูรายละเอียด &rarr;' : 'อ่านเลย &rarr;'}</span>
                                    </Link>
                                ))
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}
