'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Wallet,
    Users,
    MessageSquare,
    TrendingUp,
    Sparkles,
    BookOpen,
    ArrowRight,
    Plus,
    PenTool,
    Image as ImageIcon
} from 'lucide-react';
import styles from './dashboard.module.css';
import { MOCK_STORIES } from '@/lib/dummy-data';
import { supabase } from '@/lib/supabase';

type DBStoryRow = {
    id: string;
    title: string;
    cover_url: string | null;
    category: string;
    pen_name: string;
    synopsis: string | null;
    status: string;
    completion_status: string | null;
    created_at: string | null;
};

export default function DashboardPage() {
    const [activeTab, setActiveTab] = useState('all');
    const [dbStories, setDbStories] = useState<DBStoryRow[]>([]);

    // Fetch real stories from Supabase
    useEffect(() => {
        const fetchStories = async () => {
            const { data, error } = await supabase
                .from('stories')
                .select('*')
                .order('created_at', { ascending: false });

            if (!error && data) {
                setDbStories(data);
            }
        };
        fetchStories();
    }, []);

    // Combine DB stories with mock stories
    const allStories = [
        ...dbStories.map(s => ({
            id: s.id,
            title: s.title,
            coverUrl: s.cover_url || 'https://images.unsplash.com/photo-1518621736915-f3b1c41bfd00?auto=format&fit=crop&w=800&q=80',
            type: s.category === 'fanfic' ? 'fanfic' : 'novel',
            penName: s.pen_name,
            synopsis: s.synopsis,
            status: s.status,
            completionStatus: s.completion_status || 'ongoing',
            createdAt: s.created_at,
            isFromDB: true,
        })),
        ...MOCK_STORIES.map((s, i) => ({
            id: s.id,
            title: s.title,
            coverUrl: s.coverUrl,
            type: i % 3 === 0 ? 'fanfic' : (i % 5 === 0 ? 'cartoon' : 'novel'),
            penName: s.author,
            synopsis: s.synopsis,
            status: 'published',
            completionStatus: i % 4 === 0 ? 'completed' : 'ongoing',
            createdAt: null,
            isFromDB: false,
        }))
    ];

    const filteredStories = activeTab === 'all'
        ? allStories
        : allStories.filter(s => s.type === activeTab);

    return (
        <main className={styles.main}>
            <nav className={styles.navbar}>
                <div className={styles.navLeft}>
                    <Link href="/" className={styles.logo}>FLOWFIC STUDIO</Link>
                    <span className={styles.navDivider}>/</span>
                    <span className={styles.pageTitle}>แดชบอร์ดนักเขียน</span>
                </div>
                <div className={styles.navRight}>
                    <Link href="/story/create" className={styles.createBtn}>
                        <Plus size={16} /> แต่งเรื่องใหม่
                    </Link>
                    <div className={styles.profileAvatar}>W</div>
                </div>
            </nav>

            <div className={styles.content}>

                {/* Welcome Section */}
                <div className={styles.welcomeSection}>
                    <h1 className={styles.greeting}>สวัสดี, Flow Writer 👋</h1>
                    <p className={styles.subtitle}>ภาพรวมผลงานและนิยายแชทปัญญาประดิษฐ์ของคุณ</p>
                </div>

                {/* Stats Grid */}
                <div className={styles.statsGrid}>
                    <div className={styles.statCard}>
                        <div className={styles.statIconWrapper} style={{ backgroundColor: 'rgba(28, 198, 172, 0.1)', color: 'var(--primary)' }}>
                            <Wallet size={24} />
                        </div>
                        <div className={styles.statInfo}>
                            <p className={styles.statLabel}>รายได้เดือนนี้ (บาท)</p>
                            <h3 className={styles.statValue}>12,450</h3>
                            <p className={styles.statChange}><TrendingUp size={14} /> +15% จากเดือนก่อน</p>
                        </div>
                    </div>

                    <div className={styles.statCard}>
                        <div className={styles.statIconWrapper} style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
                            <Sparkles size={24} />
                        </div>
                        <div className={styles.statInfo}>
                            <p className={styles.statLabel}>AI Subscribers</p>
                            <h3 className={styles.statValue}>842</h3>
                            <p className={styles.statDesc}>ผู้ใช้ที่สมัครคุยกับตัวละคร</p>
                        </div>
                    </div>

                    <div className={styles.statCard}>
                        <div className={styles.statIconWrapper} style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                            <Users size={24} />
                        </div>
                        <div className={styles.statInfo}>
                            <p className={styles.statLabel}>ยอดวิวนิยายรวม</p>
                            <h3 className={styles.statValue}>145.2K</h3>
                        </div>
                    </div>

                    <div className={styles.statCard}>
                        <div className={styles.statIconWrapper} style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                            <MessageSquare size={24} />
                        </div>
                        <div className={styles.statInfo}>
                            <p className={styles.statLabel}>คำถาม AI ที่รออนุมัติ</p>
                            <h3 className={styles.statValue}>12</h3>
                            <p className={styles.statAction}>คลิกเพื่อสอน AI เพิ่มเติม</p>
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className={styles.mainGrid}>

                    {/* Active Stories */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <h2 className={styles.cardTitle}>นิยายของคุณ</h2>
                            <button className={styles.cardAction}>ดูทั้งหมด</button>
                        </div>

                        {/* Category Tabs */}
                        <div className={styles.tabsContainer}>
                            <button
                                className={`${styles.tabBtn} ${activeTab === 'all' ? styles.activeTab : ''}`}
                                onClick={() => setActiveTab('all')}
                            >
                                ทั้งหมด
                            </button>
                            <button
                                className={`${styles.tabBtn} ${activeTab === 'novel' ? styles.activeTab : ''}`}
                                onClick={() => setActiveTab('novel')}
                            >
                                <PenTool size={14} /> นิยาย (Original)
                            </button>
                            <button
                                className={`${styles.tabBtn} ${activeTab === 'fanfic' ? styles.activeTab : ''}`}
                                onClick={() => setActiveTab('fanfic')}
                            >
                                <Sparkles size={14} /> แฟนฟิค
                            </button>
                            <button
                                className={`${styles.tabBtn} ${activeTab === 'cartoon' ? styles.activeTab : ''}`}
                                onClick={() => setActiveTab('cartoon')}
                            >
                                <ImageIcon size={14} /> การ์ตูน
                            </button>
                        </div>

                        <div className={styles.storyList}>
                            {filteredStories.map((story, index) => {
                                // Deterministic mock numbers based on index
                                const mockAiSubs = 100 + (index * 45) % 500;
                                const mockRevenue = 1000 + (index * 123) % 5000;

                                // Format relative time for DB stories
                                const timeAgo = story.createdAt
                                    ? `สร้างเมื่อ ${new Date(story.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}`
                                    : 'อัพเดท 2 วันก่อน';

                                return (
                                    <div key={story.id} className={styles.storyListItem}>
                                        <img src={story.coverUrl} alt={story.title} className={styles.storyThumb} />
                                        <div className={styles.storyDetails}>
                                            <div className={styles.titleRow}>
                                                <h4 className={styles.storyTitle}>{story.title}</h4>
                                                {story.type === 'fanfic' && <span className={styles.badgeFanfic}>Fanfic</span>}
                                                {story.type === 'novel' && <span className={styles.badgeNovel}>Original</span>}
                                                {story.type === 'cartoon' && <span className={styles.badgeCartoon}>Cartoon</span>}
                                                {story.isFromDB && story.status === 'draft' && <span className={styles.badgeDraft}>Draft</span>}
                                                {story.completionStatus === 'completed' ? (
                                                    <span className={styles.badgeCompleted}>Completed</span>
                                                ) : (
                                                    <span className={styles.badgeOngoing}>Ongoing</span>
                                                )}
                                            </div>
                                            <p className={styles.storyMeta}>
                                                <BookOpen size={14} /> {timeAgo}
                                            </p>
                                        </div>
                                        <div className={styles.storyMetrics}>
                                            <div className={styles.metric}>
                                                <span className={styles.metricLabel}>AI Subs</span>
                                                <span className={styles.metricValue}>
                                                    <Sparkles size={12} /> {mockAiSubs}
                                                </span>
                                            </div>
                                            <div className={styles.metric}>
                                                <span className={styles.metricLabel}>รายได้</span>
                                                <span className={styles.metricValue}>฿{mockRevenue}</span>
                                            </div>
                                        </div>
                                        <Link href={`/story/manage/${story.id}`} className={styles.editBtn}>จัดการ <ArrowRight size={14} /></Link>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* AI Insights (The "Killer Feature" selling point) */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <h2 className={styles.cardTitle}>
                                <Sparkles size={20} style={{ color: '#8b5cf6', marginRight: '8px' }} />
                                AI Insights ข้อมูลอินไซด์คนอ่าน
                            </h2>
                        </div>
                        <div className={styles.insightsContent}>
                            <div className={styles.insightItem}>
                                <div className={styles.insightHeader}>
                                    <span className={styles.insightDot} style={{ backgroundColor: '#10b981' }}></span>
                                    <h4>ตัวละครมาแรง: Leo</h4>
                                </div>
                                <p>นักอ่านใช้เวลาแชทกับ Leo เฉลี่ย <strong>15 นาที/วัน</strong> (เพิ่มขึ้น 20%)</p>
                                <div className={styles.aiSuggestion}>
                                    <strong>AI Suggestion:</strong> ควรเปิดขาย &quot;แพ็กเกจเสียงพากย์พิเศษ&quot; ให้ Leo
                                </div>
                            </div>

                            <div className={styles.insightItem}>
                                <div className={styles.insightHeader}>
                                    <span className={styles.insightDot} style={{ backgroundColor: '#ef4444' }}></span>
                                    <h4>จุดที่คนอ่านกดปิดแชทบ่อยที่สุด</h4>
                                </div>
                                <p>นิยาย <em>&quot;ห้องแชทปริศนาตอนตีสาม&quot;</em> บทที่ 4 ผู้อ่าน 45% เลือกไม่อ่านต่อ</p>
                                <button className={styles.aiAssistBtn}>
                                    <Sparkles size={14} /> ให้ AI ช่วยรีไรท์บทนี้ให้ตื่นเต้นขึ้น
                                </button>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </main>
    );
}
