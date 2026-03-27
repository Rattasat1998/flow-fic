'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, TrendingUp, Inbox, List, Eye, Heart } from 'lucide-react';

import { SharedNavbar } from '@/components/navigation/SharedNavbar';
import { StoryMediumCard } from '@/components/story/StoryMediumCard';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { DiscoveryStory } from '@/types/discovery';

import styles from '@/components/home/HomeListPage.module.css';

type TrendingPageClientProps = {
    initialStories: DiscoveryStory[];
    currentPage: number;
    limit: number;
};

export default function TrendingPageClient({ initialStories, currentPage, limit }: TrendingPageClientProps) {
    const router = useRouter();
    const { user, isLoading: isLoadingAuth, signOut } = useAuth();
    const userId = user?.id ?? null;

    const [walletCoinBalance, setWalletCoinBalance] = useState<number | null>(null);
    const [unreadNotifCount, setUnreadNotifCount] = useState(0);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef<HTMLDivElement>(null);

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

    const handleSignOut = useCallback(async () => {
        try {
            setIsProfileMenuOpen(false);
            await signOut();
            router.push('/');
        } catch (error) {
            console.error('[TrendingPageClient] Sign out failed:', error);
        }
    }, [router, signOut]);

    const handlePageChange = (newPage: number) => {
        router.push(`/trending?page=${newPage}`);
    };

    const hasNextPage = initialStories.length === limit;

    return (
        <main className={styles.main}>
            <SharedNavbar
                user={user}
                isLoadingAuth={isLoadingAuth}
                coinBalance={walletCoinBalance}
                unreadNotifCount={unreadNotifCount}
                isProfileMenuOpen={isProfileMenuOpen}
                profileMenuRef={profileMenuRef}
                onToggleProfileMenu={() => setIsProfileMenuOpen((prev) => !prev)}
                onCloseProfileMenu={() => setIsProfileMenuOpen(false)}
                onDashboardAccess={() => {}}
                onSignOut={handleSignOut}
                onOpenLogin={() => router.push('/')}
                lovesLabel="รักเลย"
            />

            <div className={`ffPageContainer ${styles.pageShell}`} style={{ paddingTop: '100px', minHeight: '100vh' }}>
                <section className={styles.sectionHeader} style={{ marginBottom: '40px' }}>
                    <div className={styles.sectionHeaderLeft}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                            <div style={{ backgroundColor: '#ff3b30', padding: '8px', borderRadius: '12px', display: 'flex' }}>
                                <TrendingUp size={24} color="white" />
                            </div>
                            <h1 className={styles.sectionHeadline} style={{ marginBottom: 0 }}>กำลังมาแรงทั้งหมด</h1>
                        </div>
                        <p className={styles.sectionSubhead}>อันดับเรื่องที่ผู้อ่านให้ความสนใจมากที่สุด เรียงตามคะแนนความนิยมล่าสุด</p>
                    </div>
                </section>

                {initialStories.length === 0 ? (
                    <div className={styles.railStateCard}>
                        <Inbox size={18} />
                        <div>
                            <p className={styles.railStateTitle}>ยังไม่มีข้อมูล</p>
                            <p className={styles.railStateText}>ยังไม่มีเรื่องกำลังมาแรงในขณะนี้ กรุณากลับมาตรวจสอบอีกครั้งในภายหลัง</p>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className={styles.shelfGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '30px 20px' }}>
                            {initialStories.map((story) => (
                                <StoryMediumCard
                                    key={story.id}
                                    href={`/story/${story.id}`}
                                    coverUrl={story.cover_url || story.cover_wide_url}
                                    title={story.title}
                                    author={story.pen_name}
                                    enableTilt
                                    footer={(
                                        <div className={styles.mainCategoryShelfMetaRow}>
                                            <span className={styles.posterMetric}>
                                                <List size={12} className={styles.posterMetricIcon} />
                                                {story.published_chapter_count.toLocaleString('th-TH')} ตอน
                                            </span>
                                            <span className={styles.posterMetric}>
                                                <Eye size={12} className={styles.posterMetricIcon} />
                                                {(story.total_view_count ?? 0).toLocaleString('th-TH')}
                                            </span>
                                            <span className={styles.posterMetric}>
                                                <Heart size={12} className={styles.posterMetricIcon} />
                                                {(story.total_like_count ?? 0).toLocaleString('th-TH')}
                                            </span>
                                        </div>
                                    )}
                                />
                            ))}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginTop: '60px', paddingBottom: '80px' }}>
                            <button
                                onClick={() => handlePageChange(currentPage - 1)}
                                disabled={currentPage <= 1}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '10px 20px',
                                    borderRadius: '12px',
                                    backgroundColor: currentPage <= 1 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)',
                                    color: currentPage <= 1 ? 'rgba(255,255,255,0.3)' : 'white',
                                    border: 'none',
                                    cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <ChevronLeft size={20} />
                                ก่อนหน้า
                            </button>
                            
                            <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
                                หน้า {currentPage}
                            </span>

                            <button
                                onClick={() => handlePageChange(currentPage + 1)}
                                disabled={!hasNextPage}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '10px 20px',
                                    borderRadius: '12px',
                                    backgroundColor: !hasNextPage ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)',
                                    color: !hasNextPage ? 'rgba(255,255,255,0.3)' : 'white',
                                    border: 'none',
                                    cursor: !hasNextPage ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                ถัดไป
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    </>
                )}
            </div>
        </main>
    );
}
