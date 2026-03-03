'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bookmark, Trash2 } from 'lucide-react';
import styles from './bookshelf.module.css';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

type FavoriteStory = {
    id: string;
    title: string;
    coverUrl: string;
    penName: string;
    synopsis: string | null;
    chapterTitle: string;
    chapterReadIndex: number;
    writingStyle: 'narrative' | 'chat' | 'thread';
    category: 'novel' | 'fanfic' | 'cartoon';
    completionStatus: string;
    favoritedAt: string;
};

export default function BookshelfPage() {
    const router = useRouter();
    const { user, isLoading: isLoadingAuth } = useAuth();
    const [stories, setStories] = useState<FavoriteStory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [now] = useState(() => Date.now());

    function normalizeCategory(cat?: string | null): 'novel' | 'fanfic' | 'cartoon' {
        if (cat === 'fanfic' || cat === 'cartoon') return cat;
        return 'novel';
    }

    function categoryLabel(cat: 'novel' | 'fanfic' | 'cartoon') {
        switch (cat) {
            case 'fanfic': return 'แฟนฟิค';
            case 'cartoon': return 'การ์ตูน';
            default: return 'นิยาย';
        }
    }

    function normalizeWritingStyle(style?: string | null): 'narrative' | 'chat' | 'thread' {
        if (style === 'chat' || style === 'thread') return style;
        return 'narrative';
    }

    function writingStyleLabel(style: 'narrative' | 'chat' | 'thread') {
        switch (style) {
            case 'chat': return 'แชท';
            case 'thread': return 'เธรด';
            default: return 'บรรยาย';
        }
    }

    useEffect(() => {
        if (isLoadingAuth) return;
        if (!user) {
            router.push('/');
            return;
        }

        const fetchFavorites = async () => {
            setIsLoading(true);

            const { data: favData, error } = await supabase
                .from('favorites')
                .select('id, story_id, chapter_id, created_at')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error || !favData || favData.length === 0) {
                setStories([]);
                setIsLoading(false);
                return;
            }

            // Legacy data may contain multiple favorites per story, keep latest row only.
            const uniqueFavs: Array<{ id: string; story_id: string; chapter_id: string | null; created_at: string }> = [];
            const seenStoryIds = new Set<string>();
            for (const fav of favData) {
                if (seenStoryIds.has(fav.story_id)) continue;
                seenStoryIds.add(fav.story_id);
                uniqueFavs.push(fav);
            }

            const storyIds = uniqueFavs.map(f => f.story_id);

            const { data: storyData } = await supabase
                .from('stories')
                .select('id, title, cover_url, pen_name, synopsis, writing_style, category, completion_status, status')
                .in('id', storyIds)
                .eq('status', 'published');

            if (!storyData) {
                setStories([]);
                setIsLoading(false);
                return;
            }

            const { data: chapterData } = await supabase
                .from('chapters')
                .select('id, story_id, title, order_index')
                .in('story_id', storyIds)
                .eq('status', 'published')
                .order('story_id', { ascending: true })
                .order('order_index', { ascending: true });

            const chaptersByStory = new Map<string, Array<{ id: string; title: string }>>();
            (chapterData || []).forEach((chapter) => {
                const list = chaptersByStory.get(chapter.story_id) || [];
                list.push({ id: chapter.id, title: chapter.title });
                chaptersByStory.set(chapter.story_id, list);
            });

            const chapterMetaById = new Map<string, { title: string; readIndex: number }>();
            chaptersByStory.forEach((chapters) => {
                chapters.forEach((chapter, index) => {
                    chapterMetaById.set(chapter.id, { title: chapter.title, readIndex: index });
                });
            });

            const storyMap = new Map(storyData.map(s => [s.id, s]));
            const merged: FavoriteStory[] = [];

            for (const fav of uniqueFavs) {
                const story = storyMap.get(fav.story_id);
                if (!story) continue;
                const chapterMeta = fav.chapter_id ? chapterMetaById.get(fav.chapter_id) : null;
                merged.push({
                    id: story.id,
                    title: story.title,
                    coverUrl: story.cover_url || 'https://images.unsplash.com/photo-1518621736915-f3b1c41bfd00?auto=format&fit=crop&w=800&q=80',
                    penName: story.pen_name,
                    synopsis: story.synopsis,
                    chapterTitle: chapterMeta?.title || 'ตอนแรก',
                    chapterReadIndex: chapterMeta?.readIndex ?? 0,
                    writingStyle: normalizeWritingStyle(story.writing_style),
                    category: normalizeCategory(story.category),
                    completionStatus: story.completion_status || 'ongoing',
                    favoritedAt: fav.created_at,
                });
            }

            setStories(merged);
            setIsLoading(false);
        };

        fetchFavorites();
    }, [user, isLoadingAuth, router]);

    const handleRemoveFavorite = async (storyId: string) => {
        if (!user) return;
        setRemovingId(storyId);
        const { error } = await supabase
            .from('favorites')
            .delete()
            .eq('user_id', user.id)
            .eq('story_id', storyId);

        if (!error) {
            setStories(prev => prev.filter(s => s.id !== storyId));
        }
        setRemovingId(null);
    };

    const groupedStories = useMemo(() => {
        const groups: Record<'narrative' | 'chat' | 'thread', FavoriteStory[]> = {
            narrative: [],
            chat: [],
            thread: [],
        };

        stories.forEach((story) => {
            groups[normalizeWritingStyle(story.writingStyle)].push(story);
        });

        return (['narrative', 'chat', 'thread'] as const)
            .map((style) => ({
                style,
                label: writingStyleLabel(style),
                stories: groups[style],
            }))
            .filter((group) => group.stories.length > 0);
    }, [stories]);

    const timeAgo = (dateStr: string) => {
        const diff = now - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins} นาทีที่แล้ว`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days} วันที่แล้ว`;
        return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    if (isLoadingAuth || isLoading) {
        return (
            <main className={styles.main}>
                <div className={styles.loading}>กำลังโหลดชั้นหนังสือ...</div>
            </main>
        );
    }

    return (
        <main className={styles.main}>
            <nav className={styles.navbar}>
                <div className={styles.navLeft}>
                    <Link href="/" className={styles.logo}>FLOWFIC</Link>
                    <span className={styles.navDivider}>/</span>
                    <span className={styles.pageTitle}>ชั้นหนังสือของฉัน</span>
                </div>
            </nav>

            <div className={styles.content}>
                <div className={styles.header}>
                    <div className={styles.headerIcon}>
                        <Bookmark size={28} />
                    </div>
                    <div>
                        <h1 className={styles.heading}>ชั้นหนังสือของฉัน</h1>
                        <p className={styles.subheading}>เรื่องที่คุณเก็บไว้อ่าน {stories.length > 0 ? `(${stories.length} เรื่อง)` : ''}</p>
                    </div>
                </div>

                {stories.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Bookmark size={48} strokeWidth={1.5} />
                        <h2>ยังไม่มีเรื่องในชั้นหนังสือ</h2>
                        <p>กดปุ่ม <Bookmark size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> ในหน้าอ่านเรื่องเพื่อเก็บเข้าชั้น</p>
                        <Link href="/" className={styles.browseBtn}>ไปดูเรื่องน่าอ่าน</Link>
                    </div>
                ) : (
                    <div className={styles.categorySections}>
                        {groupedStories.map((group) => (
                            <section key={group.style} className={styles.categorySection}>
                                <div className={styles.categoryHeader}>
                                    <h2 className={styles.categoryHeading}>{group.label}</h2>
                                    <span className={styles.categoryCount}>{group.stories.length} เรื่อง</span>
                                </div>
                                <div className={styles.grid}>
                                    {group.stories.map((story) => {
                                        const readHref = `/story/${story.id}/read?chapter=${story.chapterReadIndex}`;
                                        return (
                                            <div key={story.id} className={styles.card}>
                                                <Link href={readHref} className={styles.cardImageLink}>
                                                    <img src={story.coverUrl} alt={story.title} className={styles.cardImage} />
                                                    <span className={styles.categoryBadge}>{categoryLabel(story.category)}</span>
                                                </Link>
                                                <div className={styles.cardBody}>
                                                    <Link href={readHref} className={styles.cardTitle}>
                                                        {story.title}
                                                    </Link>
                                                    <div className={styles.cardAuthor}>โดย {story.penName}</div>
                                                    <div className={styles.cardCategoryText}>{writingStyleLabel(story.writingStyle)}</div>
                                                    <div className={styles.cardCategoryText}>ประเภท: {categoryLabel(story.category)}</div>
                                                    <div className={styles.cardChapter}>ตอนที่เก็บ: {story.chapterTitle}</div>
                                                    {story.synopsis && (
                                                        <p className={styles.cardSynopsis}>{story.synopsis}</p>
                                                    )}
                                                    <div className={styles.cardFooter}>
                                                        <span className={styles.cardTime}>เก็บเมื่อ {timeAgo(story.favoritedAt)}</span>
                                                        <button
                                                            className={styles.removeBtn}
                                                            onClick={() => handleRemoveFavorite(story.id)}
                                                            disabled={removingId === story.id}
                                                            title="นำออกจากชั้น"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}
