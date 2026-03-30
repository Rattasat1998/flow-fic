import { useState, type ReactNode } from 'react';
import { ChevronLeft, Share2, Coins, MoreHorizontal, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import styles from './chat-reader.module.css';

interface ChatReaderLayoutProps {
    story: any;
    chapter: any;
    coinBalance: number;
    children: ReactNode;
    onPointerDown?: (e: any) => void;
    onPointerUp?: (e: any) => void;
    onPointerCancel?: (e: any) => void;
}

export function ChatReaderLayout({
    story,
    chapter,
    coinBalance,
    children,
    onPointerDown,
    onPointerUp,
    onPointerCancel
}: ChatReaderLayoutProps) {
    const router = useRouter();
    const bgUrl = story?.cover_url || story?.cover_wide_url || 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=600&q=80';

    return (
        <div className={styles.main}>
            {/* Background Layer */}
            <div 
                className={styles.backgroundOverlay} 
                style={{ backgroundImage: `url(${bgUrl})` }}
            />
            <div className={styles.backgroundDarken} />

            {/* Top Navigation */}
            <div className={styles.topNav}>
                <button type="button" onClick={() => router.back()} className={styles.iconButton}>
                    <ChevronLeft size={24} />
                </button>
                <div className={styles.storyTitle}>
                    {chapter?.title || story?.title || 'ตอนที่กำลังอ่าน'}
                </div>
                <div className={styles.navActions}>
                    <div className={styles.coinBadge}>
                        <Coins size={14} color="#fcd34d" />
                        {coinBalance}
                    </div>
                    <button type="button" className={styles.iconButton}>
                        <Plus size={20} />
                    </button>
                    <button type="button" className={styles.iconButton}>
                        <Share2 size={18} />
                    </button>
                </div>
            </div>

            {/* Floating Hearts */}
            <div className={styles.floatingHeartContainer}>
                <span className={styles.heartNumber}>10</span>
                <span style={{fontSize: '10px', color: 'rgba(255,255,255,0.8)'}}>คนรู้จัก</span>
            </div>

            {/* Chat Content Area */}
            <div 
                className={styles.chatContainer} 
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
            >
                {children}
            </div>

            {/* Bottom Input & Quick Actions */}
            <div className={styles.bottomArea}>
                <div className={styles.quickActionsRow}>
                    <button type="button" className={styles.actionPill}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4v16m-8-8h16"></path></svg>
                        แฟ้มข้อมูล
                    </button>
                    <button type="button" className={styles.actionPill}>
                        ดั้งเดิม-พื้นฐาน
                    </button>
                    <button type="button" className={`${styles.actionPill} ${styles.pillPurple}`}>
                        ความทรงจำ
                    </button>
                </div>

                <div className={styles.inputBarContainer}>
                    <div className={styles.inputFieldWrap} onPointerUp={onPointerUp}>
                        <span className={styles.inputFieldPlaceholder}>ป้อนข้อความ (แตะเพื่อไปต่อ)</span>
                        <button type="button" className={styles.inputIconBtn}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"></path></svg>
                        </button>
                    </div>
                    <button type="button" className={styles.plusBtn}>
                        <Plus size={20} />
                        <span className={styles.redDot} />
                    </button>
                </div>
            </div>
        </div>
    );
}
