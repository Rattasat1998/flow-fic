'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { MOCK_STORIES } from '@/lib/dummy-data';
import { Star, BarChart2, Heart, PlaySquare, ArrowLeft } from 'lucide-react';
import styles from './details.module.css';

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
};

type DBChapter = {
    id: string;
    title: string;
    order_index: number;
    read_count: number;
    created_at: string;
};

const fallbackCover = 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=600&q=80';

export default function StoryDetailsPage({ params }: StoryDetailsProps) {
    const unwrappedParams = use(params);
    const storyId = unwrappedParams.id;
    const mockStory = MOCK_STORIES.find(s => s.id === storyId) || null;

    const [isLoading, setIsLoading] = useState(!mockStory);
    const [dbStory, setDbStory] = useState<DBStory | null>(null);
    const [dbChapters, setDbChapters] = useState<DBChapter[]>([]);

    useEffect(() => {
        if (mockStory) {
            // Mock chapters
            setDbChapters([
                { id: 'm1', title: 'ตอนที่ 1 เอาชีวิตรอด', order_index: 0, read_count: 1540, created_at: new Date().toISOString() },
                { id: 'm2', title: 'ตอนที่ 2 ร่องรอยเดิม', order_index: 1, read_count: 810, created_at: new Date().toISOString() }
            ]);
            return;
        }

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

            const { data: chapterData } = await supabase
                .from('chapters')
                .select('id, title, order_index, read_count, created_at')
                .eq('story_id', storyId)
                .eq('status', 'published')
                .order('order_index', { ascending: true });

            setDbStory(storyData as DBStory);
            setDbChapters(chapterData as DBChapter[] || []);
            setIsLoading(false);
        };

        fetchStoryDetails();
    }, [mockStory, storyId]);

    if (isLoading) {
        return (
            <main className={styles.main} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p>กำลังโหลดข้อมูล...</p>
            </main>
        );
    }

    const activeStory = mockStory
        ? {
            title: mockStory.title,
            author: mockStory.author,
            synopsis: mockStory.synopsis,
            cover: (mockStory as any).coverImage || mockStory.character.avatarUrl,
            category: (mockStory as any).type || 'Original',
            status: 'published',
            completion: 'ongoing',
            score: (mockStory as any).score || 8.9,
            views: (mockStory as any).views || 142900,
            favorites: (mockStory as any).likes || 3890
        }
        : dbStory
            ? {
                title: dbStory.title,
                author: dbStory.pen_name,
                synopsis: dbStory.synopsis,
                cover: dbStory.cover_url || fallbackCover,
                category: dbStory.category === 'fanfic' ? 'Fanfiction' : 'Original',
                status: dbStory.status,
                completion: dbStory.completion_status,
                score: 8.5, // Dummy default score for real DB stories
                views: dbChapters.reduce((sum, ch) => sum + ch.read_count, 0),
                favorites: 0 // Mock for now until favorites table exists
            }
            : null;

    if (!activeStory) {
        return (
            <main className={styles.main} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                <h2>ไม่พบข้อมูลเรื่อง</h2>
                <Link href="/" className={styles.backBtn}><ArrowLeft size={16} /> กลับหน้าหลัก</Link>
            </main>
        );
    }

    const totalChapters = dbChapters.length;

    return (
        <main className={styles.main}>
            <div className={styles.heroBanner}>
                <div className={styles.heroBg} style={{ backgroundImage: `url(${activeStory.cover})` }} />
                <div className={styles.heroOverlay}>
                    <nav className={styles.topNavigation}>
                        <Link href="/" className={styles.backBtn}>
                            <ArrowLeft size={18} /> หน้าหลัก
                        </Link>
                    </nav>

                    <div className={styles.heroContent}>
                        <div className={styles.heroPosterContainer}>
                            <img src={activeStory.cover} alt={activeStory.title} className={styles.heroPoster} />
                        </div>

                        <div className={styles.heroDetails}>
                            <h1 className={styles.heroTitle}>{activeStory.title}</h1>
                            <div className={styles.heroMeta}>
                                {activeStory.category} <span className={styles.heroMetaDivider}>·</span> {activeStory.author}
                            </div>

                            <p className={styles.heroSubtitle}>
                                {activeStory.synopsis || 'ไม่มีคำโปรยสำหรับเรื่องนี้'}
                            </p>

                            <div className={styles.heroBadges}>
                                <span className={styles.badge + ' ' + styles.badgeDark}>
                                    {activeStory.category === 'Fanfiction' ? 'ออริจินัลฟิค' : 'ออริจินัล'}
                                </span>
                                <span className={styles.badge + ' ' + (activeStory.completion === 'completed' ? styles.badgeScore : styles.badgeActive)}>
                                    {activeStory.completion === 'completed' ? 'จบแล้ว' : 'กำลังออนแอร์'}
                                </span>
                                <span className={styles.badge + ' ' + styles.badgeDark}>
                                    👁️ {activeStory.views.toLocaleString()} Views
                                </span>
                                <span className={styles.badge + ' ' + styles.badgeDark}>
                                    ❤️ {activeStory.favorites.toLocaleString()} Loves
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
                    </div>

                    <div className={styles.infoBlock}>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>สถานะการเผยแพร่</span>
                            <span className={styles.infoValue}>{activeStory.status === 'published' ? 'เผยแพร่แล้ว' : 'แบบร่าง'}</span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>สถานะความสมบูรณ์</span>
                            <span className={styles.infoValue}>{activeStory.completion === 'completed' ? 'จบแล้ว' : 'ยังไม่จบ'}</span>
                        </div>
                        <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>จำนวนตอนทั้งหมด</span>
                            <span className={styles.infoValue}>{totalChapters} ตอน</span>
                        </div>
                        {activeStory.score > 0 && (
                            <div className={styles.infoItem}>
                                <span className={styles.infoLabel}>คะแนนความนิยม</span>
                                <span className={styles.infoValue} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#d97706' }}>
                                    <Star size={16} fill="currentColor" /> {activeStory.score.toFixed(1)} / 10
                                </span>
                            </div>
                        )}
                    </div>
                </aside>

                <div className={styles.mainContent}>
                    <section className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <h2 className={styles.sectionTitle}>คำโปรย (Synopsis)</h2>
                        </div>
                        <p className={styles.synopsisText}>{activeStory.synopsis || 'ไม่มีคำโปรยสำหรับเรื่องนี้'}</p>
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
                                            </div>
                                        </div>
                                        <span className={styles.chapterAction}>อ่านเลย &rarr;</span>
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
