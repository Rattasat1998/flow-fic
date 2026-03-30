import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Share2, MoreHorizontal, Heart, Eye } from 'lucide-react';
import styles from './chat-details.module.css';

interface ChatStoryDetailsLayoutProps {
    storyId: string;
    story: any;
    authorSummary?: any;
    followerCount: number;
    likeCount: number;
    onBack: () => void;
}

type TabKey = 'info' | 'situation' | 'album' | 'group' | 'characters';

export function ChatStoryDetailsLayout({
    storyId,
    story,
    authorSummary,
    followerCount,
    likeCount,
    onBack
}: ChatStoryDetailsLayoutProps) {
    const [activeTab, setActiveTab] = useState<TabKey>('info');
    const coverUrl = story.cover_url || story.cover_wide_url || 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=600&q=80';

    return (
        <div className={styles.main}>
            {/* Top Back/Share Bar */}
            <header className={styles.topBar}>
                <button type="button" onClick={onBack} className={styles.iconBtn}>
                    <ChevronLeft size={20} />
                </button>
                <div className={styles.navActions}>
                    <button type="button" className={styles.iconBtn}>
                        <Share2 size={16} />
                    </button>
                    <button type="button" className={styles.iconBtn}>
                        <MoreHorizontal size={18} />
                    </button>
                </div>
            </header>

            {/* Immersive Hero Section */}
            <div className={styles.heroSection}>
                <div 
                    className={styles.heroBackground} 
                    style={{ backgroundImage: `url(${coverUrl})` }}
                />
                
                <div className={styles.heroContent}>
                    <img src={coverUrl} alt={story.title} className={styles.coverImage} />
                    <h1 className={styles.title}>{story.title}</h1>
                    <div className={styles.authorRow}>
                        โดย {authorSummary?.name || story.pen_name || 'ไม่ระบุนามปากกา'}
                    </div>
                    
                    <div className={styles.statsRow}>
                        <div className={styles.statItem}>
                            <Heart size={14} fill="currentColor" color="#FF3366" />
                            <span>{likeCount.toLocaleString('th-TH')}</span>
                        </div>
                        <div className={styles.statItem}>
                            <Eye size={14} />
                            <span>{followerCount.toLocaleString('th-TH')} ผู้ติดตาม</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Bottom Sheet */}
            <div className={styles.contentSheet}>
                {/* Tabs */}
                <div className={styles.tabsContainer}>
                    <button type="button" className={`${styles.tabBtn} ${activeTab === 'info' ? styles.tabBtnActive : ''}`} onClick={() => setActiveTab('info')}>
                        ข้อมูล
                        {activeTab === 'info' && <span className={styles.tabIndicator} />}
                    </button>
                    <button type="button" className={`${styles.tabBtn} ${activeTab === 'situation' ? styles.tabBtnActive : ''}`} onClick={() => setActiveTab('situation')}>
                        สถานการณ์
                        {activeTab === 'situation' && <span className={styles.tabIndicator} />}
                    </button>
                    <button type="button" className={`${styles.tabBtn} ${activeTab === 'album' ? styles.tabBtnActive : ''}`} onClick={() => setActiveTab('album')}>
                        อัลบั้ม
                        {activeTab === 'album' && <span className={styles.tabIndicator} />}
                    </button>
                    <button type="button" className={`${styles.tabBtn} ${activeTab === 'group' ? styles.tabBtnActive : ''}`} onClick={() => setActiveTab('group')}>
                        แชทกลุ่ม
                        {activeTab === 'group' && <span className={styles.tabIndicator} />}
                    </button>
                </div>

                {/* Tab Content */}
                <div className={styles.tabContent}>
                    {activeTab === 'info' && (
                        <div className={styles.synopsisText}>
                            {story.synopsis || 'ยังไม่มีคำอธิบายเรื่อง'}
                        </div>
                    )}
                    
                    {activeTab !== 'info' && (
                        <div className={styles.placeholderSection}>
                            <p>ยังไม่มีข้อมูลในส่วนนี้</p>
                        </div>
                    )}
                </div>
                
                {/* Pad bottom for fixed action bar */}
                <div style={{ height: '100px' }} />
            </div>

            {/* Read Button */}
            <div className={styles.bottomActionWrap}>
                <Link href={`/story/${storyId}/read`} className={styles.readBtn}>
                    เริ่มอ่านเลย
                </Link>
            </div>
        </div>
    );
}
