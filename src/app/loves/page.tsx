'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Heart, Trash2 } from 'lucide-react';
import styles from './loves.module.css';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

type LovedStory = {
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
  likedAt: string;
};

export default function LovesPage() {
  const router = useRouter();
  const { user, isLoading: isLoadingAuth } = useAuth();
  const [stories, setStories] = useState<LovedStory[]>([]);
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

    const fetchLoves = async () => {
      setIsLoading(true);

      const { data: likeData, error } = await supabase
        .from('likes')
        .select('id, story_id, chapter_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error || !likeData || likeData.length === 0) {
        setStories([]);
        setIsLoading(false);
        return;
      }

      const uniqueLikes: Array<{ id: string; story_id: string; chapter_id: string | null; created_at: string }> = [];
      const seenStoryIds = new Set<string>();
      for (const like of likeData) {
        if (seenStoryIds.has(like.story_id)) continue;
        seenStoryIds.add(like.story_id);
        uniqueLikes.push(like);
      }

      const storyIds = uniqueLikes.map((like) => like.story_id);

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

      const storyMap = new Map(storyData.map((story) => [story.id, story]));
      const merged: LovedStory[] = [];

      for (const like of uniqueLikes) {
        const story = storyMap.get(like.story_id);
        if (!story) continue;

        const chapterMeta = like.chapter_id ? chapterMetaById.get(like.chapter_id) : null;

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
          likedAt: like.created_at,
        });
      }

      setStories(merged);
      setIsLoading(false);
    };

    fetchLoves();
  }, [user, isLoadingAuth, router]);

  const handleRemoveLike = async (storyId: string) => {
    if (!user) return;
    setRemovingId(storyId);

    const { error } = await supabase
      .from('likes')
      .delete()
      .eq('user_id', user.id)
      .eq('story_id', storyId);

    if (!error) {
      setStories((prev) => prev.filter((story) => story.id !== storyId));
    }
    setRemovingId(null);
  };

  const groupedStories = useMemo(() => {
    const groups: Record<'narrative' | 'chat' | 'thread', LovedStory[]> = {
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
        <div className={styles.loading}>กำลังโหลดรายการรักเลย...</div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <nav className={styles.navbar}>
        <div className={styles.navLeft}>
          <Link href="/" className={styles.logo}>FLOWFIC</Link>
          <span className={styles.navDivider}>/</span>
          <span className={styles.pageTitle}>รักเลยของฉัน</span>
        </div>
      </nav>

      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.headerIcon}>
            <Heart size={28} />
          </div>
          <div>
            <h1 className={styles.heading}>รักเลยของฉัน</h1>
            <p className={styles.subheading}>เรื่องที่คุณกดหัวใจ {stories.length > 0 ? `(${stories.length} เรื่อง)` : ''}</p>
          </div>
        </div>

        {stories.length === 0 ? (
          <div className={styles.emptyState}>
            <Heart size={48} strokeWidth={1.5} />
            <h2>ยังไม่มีเรื่องที่คุณกดหัวใจ</h2>
            <p>กดปุ่ม <Heart size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> ในหน้าอ่านตอนที่ชอบ</p>
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
                          <div className={styles.cardChapter}>ตอนที่กดใจ: {story.chapterTitle}</div>
                          {story.synopsis && (
                            <p className={styles.cardSynopsis}>{story.synopsis}</p>
                          )}
                          <div className={styles.cardFooter}>
                            <span className={styles.cardTime}>กดรักเมื่อ {timeAgo(story.likedAt)}</span>
                            <button
                              className={styles.removeBtn}
                              onClick={() => handleRemoveLike(story.id)}
                              disabled={removingId === story.id}
                              title="ยกเลิกรัก"
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
