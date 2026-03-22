'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Eye, Heart } from 'lucide-react';
import styles from './writer.module.css';
import { supabase } from '@/lib/supabase';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { CompactStoryCard } from '@/components/story/CompactStoryCard';
import { ShareButton } from '@/components/share/ShareButton';
import { useTracking } from '@/hooks/useTracking';

interface WriterProfileClientProps {
    writerId: string;
}

type ProfileRow = {
    id: string;
    pen_name: string | null;
    bio: string | null;
    avatar_url: string | null;
};

type StoryRow = {
    id: string;
    title: string;
    cover_url: string | null;
    cover_wide_url: string | null;
    pen_name: string | null;
    writing_style: string | null;
    category: string | null;
    completion_status: string | null;
    created_at: string | null;
};

type ChapterReadRow = {
    story_id: string;
    read_count: number | null;
};

type AuthorProfile = {
    id: string;
    penName: string;
    bio: string;
    avatarUrl: string | null;
};

type AuthorStory = {
    id: string;
    title: string;
    coverUrl: string;
    penName: string;
    writingStyle: 'narrative' | 'chat' | 'thread';
    category: 'original' | 'fanfic';
    completionStatus: 'ongoing' | 'completed';
    createdAt: string | null;
};

type AuthorStats = {
    publishedStoryCount: number;
    totalViews: number;
    totalLikes: number;
};

const fallbackCover = 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=600&q=80';

const normalizeWritingStyle = (value: string | null | undefined): 'narrative' | 'chat' | 'thread' => {
    if (value === 'chat' || value === 'thread') return value;
    return 'narrative';
};

const normalizeCompletionStatus = (value: string | null | undefined): 'ongoing' | 'completed' => {
    return value === 'completed' ? 'completed' : 'ongoing';
};

const normalizeCategory = (value: string | null | undefined): 'original' | 'fanfic' => {
    return value === 'fanfic' ? 'fanfic' : 'original';
};

const categoryLabel = (value: 'original' | 'fanfic') => {
    return value === 'fanfic' ? 'แฟนฟิค' : 'ออริจินัล';
};

const writingStyleLabel = (value: 'narrative' | 'chat' | 'thread') => {
    switch (value) {
        case 'chat':
            return 'แชท';
        case 'thread':
            return 'เธรด';
        default:
            return 'บรรยาย';
    }
};

export default function WriterProfileClient({ writerId }: WriterProfileClientProps) {
    useTracking({ autoPageView: true, pagePath: `/writer/${writerId}` });

    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [author, setAuthor] = useState<AuthorProfile | null>(null);
    const [stories, setStories] = useState<AuthorStory[]>([]);
    const [stats, setStats] = useState<AuthorStats>({
        publishedStoryCount: 0,
        totalViews: 0,
        totalLikes: 0,
    });

    useEffect(() => {
        let cancelled = false;

        const fetchWriterProfile = async () => {
            setIsLoading(true);
            setLoadError('');

            const [{ data: profileData, error: profileError }, { data: storyData, error: storyError }] = await Promise.all([
                supabase
                    .from('profiles')
                    .select('id, pen_name, bio, avatar_url')
                    .eq('id', writerId)
                    .maybeSingle(),
                supabase
                    .from('stories')
                    .select('id, title, cover_url, cover_wide_url, pen_name, writing_style, category, completion_status, created_at')
                    .eq('user_id', writerId)
                    .eq('status', 'published')
                    .order('created_at', { ascending: false }),
            ]);

            if (cancelled) return;

            if (storyError) {
                console.error('[WriterProfile] Failed to fetch stories:', storyError);
                setLoadError('ไม่สามารถโหลดผลงานของผู้เขียนได้');
                setIsLoading(false);
                return;
            }

            if (profileError) {
                console.warn('[WriterProfile] Failed to fetch profile row:', profileError);
            }

            const publishedStories = ((storyData as StoryRow[] | null) || []).map((story) => ({
                id: story.id,
                title: story.title,
                coverUrl: story.cover_url || story.cover_wide_url || fallbackCover,
                penName: (story.pen_name || '').trim(),
                writingStyle: normalizeWritingStyle(story.writing_style),
                category: normalizeCategory(story.category),
                completionStatus: normalizeCompletionStatus(story.completion_status),
                createdAt: story.created_at,
            }));

            const profileRow = profileData as ProfileRow | null;
            const fallbackPenName = publishedStories[0]?.penName || 'นักเขียนนิรนาม';
            const hasAuthorContent = !!profileRow || publishedStories.length > 0;
            const resolvedAuthor = hasAuthorContent
                ? {
                    id: writerId,
                    penName: (profileRow?.pen_name || fallbackPenName).trim() || 'นักเขียนนิรนาม',
                    bio: (profileRow?.bio || '').trim(),
                    avatarUrl: profileRow?.avatar_url || null,
                }
                : null;

            if (!resolvedAuthor) {
                setAuthor(null);
                setStories([]);
                setStats({
                    publishedStoryCount: 0,
                    totalViews: 0,
                    totalLikes: 0,
                });
                setLoadError('ไม่พบข้อมูลผู้เขียน');
                setIsLoading(false);
                return;
            }

            let totalViews = 0;
            let totalLikes = 0;

            if (publishedStories.length > 0) {
                const storyIds = publishedStories.map((story) => story.id);
                const [{ data: chapterData, error: chapterError }, { count: likesCount, error: likesError }] = await Promise.all([
                    supabase
                        .from('chapters')
                        .select('story_id, read_count')
                        .eq('status', 'published')
                        .in('story_id', storyIds),
                    supabase
                        .from('likes')
                        .select('*', { count: 'exact', head: true })
                        .in('story_id', storyIds),
                ]);

                if (cancelled) return;

                if (chapterError) {
                    console.error('[WriterProfile] Failed to aggregate chapter reads:', chapterError);
                } else {
                    totalViews = ((chapterData as ChapterReadRow[] | null) || []).reduce(
                        (sum, chapter) => sum + (chapter.read_count || 0),
                        0
                    );
                }

                if (likesError) {
                    console.error('[WriterProfile] Failed to aggregate likes:', likesError);
                } else {
                    totalLikes = likesCount || 0;
                }
            }

            setAuthor(resolvedAuthor);
            setStories(publishedStories);
            setStats({
                publishedStoryCount: publishedStories.length,
                totalViews,
                totalLikes,
            });
            setIsLoading(false);
        };

        fetchWriterProfile();

        return () => {
            cancelled = true;
        };
    }, [writerId]);

    const summaryItems = useMemo(() => ([
        {
            label: 'เรื่องที่เผยแพร่',
            value: `${stats.publishedStoryCount.toLocaleString('th-TH')} เรื่อง`,
            icon: BookOpen,
        },
        {
            label: 'ยอดอ่านรวม',
            value: `${stats.totalViews.toLocaleString('th-TH')} ครั้ง`,
            icon: Eye,
        },
        {
            label: 'ยอดถูกใจรวม',
            value: `${stats.totalLikes.toLocaleString('th-TH')} ครั้ง`,
            icon: Heart,
        },
    ]), [stats]);

    if (isLoading) {
        return (
            <main className={`${styles.main} ffStudioShell`}>
                <div className={`ffStudioPage ${styles.statePage}`}>
                    <div className={`ffStudioEmpty ${styles.stateCard}`}>กำลังโหลดโปรไฟล์ผู้เขียน...</div>
                </div>
            </main>
        );
    }

    if (!author) {
        return (
            <main className={`${styles.main} ffStudioShell`}>
                <nav className={`ffStudioTopbar ${styles.topbar}`}>
                    <div className="ffStudioTopbarInner">
                        <div className={`ffStudioTopbarContext ${styles.topbarContext}`}>
                            <BrandLogo href="/" size="md" className={styles.topbarLogo} />
                            <span className={styles.topbarDivider}>/</span>
                            <div className="ffStudioTopbarCopy">
                                <span className="ffStudioTopbarEyebrow">Writer Profile</span>
                                <span className="ffStudioTopbarTitle">โปรไฟล์ผู้เขียน</span>
                            </div>
                        </div>
                    </div>
                </nav>
                <div className={`ffStudioPage ${styles.statePage}`}>
                    <div className={`ffStudioEmpty ${styles.stateCard}`}>
                        <h1 className={styles.stateTitle}>{loadError || 'ไม่พบข้อมูลผู้เขียน'}</h1>
                        <p className={styles.stateDescription}>โปรไฟล์นี้อาจถูกลบไปแล้ว หรือยังไม่มีผลงานที่เผยแพร่</p>
                    </div>
                </div>
            </main>
        );
    }

    const authorInitial = author.penName.trim().charAt(0).toUpperCase() || 'W';
    const authorBio = author.bio || 'ผู้เขียนคนนี้ยังไม่ได้เพิ่มคำแนะนำตัวเอง';
    const authorShareText = author.bio || 'ดูโปรไฟล์นักเขียนบน FlowFic';

    return (
        <main className={`${styles.main} ffStudioShell`}>
            <nav className={`ffStudioTopbar ${styles.topbar}`}>
                <div className="ffStudioTopbarInner">
                    <div className={`ffStudioTopbarContext ${styles.topbarContext}`}>
                        <BrandLogo href="/" size="md" className={styles.topbarLogo} />
                        <span className={styles.topbarDivider}>/</span>
                        <div className="ffStudioTopbarCopy">
                            <span className="ffStudioTopbarEyebrow">Writer Profile</span>
                            <span className="ffStudioTopbarTitle">{author.penName}</span>
                            <span className="ffStudioTopbarMeta">{stats.publishedStoryCount} เรื่องที่เผยแพร่</span>
                        </div>
                    </div>
                </div>
            </nav>

            <div className={`ffStudioPage ${styles.pageBody}`}>
                <section className={`${styles.heroSection} ffStudioMasthead`}>
                    <div className={styles.heroInner}>
                        <div className={styles.avatarShell}>
                            {author.avatarUrl ? (
                                <img src={author.avatarUrl} alt={author.penName} className={styles.avatarImage} />
                            ) : (
                                <div className={styles.avatarPlaceholder}>{authorInitial}</div>
                            )}
                        </div>
                        <div className={styles.heroContent}>
                            <span className={styles.heroEyebrow}>นักเขียน</span>
                            <h1 className={styles.heroTitle}>{author.penName}</h1>
                            <p className={`${styles.heroBio} ${author.bio ? '' : styles.heroBioMuted}`.trim()}>
                                {authorBio}
                            </p>
                            <div className={styles.heroActions}>
                                <ShareButton
                                    title={author.penName}
                                    text={authorShareText}
                                    urlPath={`/writer/${writerId}`}
                                    idleLabel="แชร์โปรไฟล์"
                                    className={styles.shareBtn}
                                />
                            </div>
                        </div>
                    </div>
                </section>

                <section className={`${styles.summaryStrip} ffStudioPanel`}>
                    {summaryItems.map((item) => {
                        const Icon = item.icon;

                        return (
                            <div key={item.label} className={styles.summaryItem}>
                                <span className={styles.summaryLabel}>
                                    <Icon size={14} />
                                    {item.label}
                                </span>
                                <strong className={styles.summaryValue}>{item.value}</strong>
                            </div>
                        );
                    })}
                </section>

                <section className={`${styles.section} ffStudioPanel`}>
                    <div className={styles.sectionHeader}>
                        <div>
                            <h2 className={styles.sectionTitle}>ผลงานที่เผยแพร่แล้ว</h2>
                            <p className={styles.sectionMeta}>เรียงจากล่าสุดไปเก่าสุด และเปิดเข้าสู่หน้ารายละเอียดเรื่องได้ทันที</p>
                        </div>
                    </div>

                    {stories.length > 0 ? (
                        <div className={styles.storyGrid}>
                            {stories.map((story) => (
                                <CompactStoryCard
                                    key={story.id}
                                    href={`/story/${story.id}`}
                                    coverUrl={story.coverUrl}
                                    title={story.title}
                                    author={story.penName || author.penName}
                                    tags={[categoryLabel(story.category), writingStyleLabel(story.writingStyle)]}
                                    isCompleted={story.completionStatus === 'completed'}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className={`ffStudioEmpty ${styles.emptyState}`}>
                            <p className={styles.emptyStateTitle}>ยังไม่มีผลงานที่เผยแพร่</p>
                            <p className={styles.emptyStateDescription}>เมื่อผู้เขียนคนนี้เผยแพร่เรื่องแล้ว รายการผลงานจะปรากฏในส่วนนี้</p>
                        </div>
                    )}
                </section>

                <div className={styles.footerActions}>
                    <Link href="/" className={styles.homeLink}>กลับหน้าแรก</Link>
                </div>
            </div>
        </main>
    );
}
