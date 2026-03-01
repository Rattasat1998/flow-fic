'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Search, Menu } from 'lucide-react';
import styles from './home.module.css';
import { supabase } from '@/lib/supabase';
import { MAIN_CATEGORIES } from '@/lib/categories';
import { useAuth } from '@/contexts/AuthContext';

type HomeStory = {
    id: string;
    title: string;
    pen_name: string;
    cover_url: string | null;
    synopsis: string | null;
    category: string;
    main_category: string | null;
    status: string;
    completion_status: string | null;
    created_at: string | null;
};

export default function HomePage() {
    const { user, isLoading: isLoadingAuth, signInWithFacebook, signInWithGoogle, signOut } = useAuth();
    const [stories, setStories] = useState<HomeStory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [authError, setAuthError] = useState<string | null>(null);

    useEffect(() => {
        const fetchStories = async () => {
            const { data, error } = await supabase
                .from('stories')
                .select('id, title, pen_name, cover_url, synopsis, category, main_category, status, completion_status, created_at')
                .eq('status', 'published')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Failed to fetch stories:', error);
                setStories([]);
            } else {
                setStories((data || []) as HomeStory[]);
            }

            setIsLoading(false);
        };

        fetchStories();
    }, []);

    // Filter stories based on selected category
    const filteredStories = stories.filter(story => {
        if (selectedCategory === 'all') return true;
        return story.main_category === selectedCategory;
    });

    const handleGoogleSignIn = async () => {
        setAuthError(null);
        try {
            await signInWithGoogle();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Google login failed';
            setAuthError(message);
        }
    };

    const handleFacebookSignIn = async () => {
        setAuthError(null);
        try {
            await signInWithFacebook();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Facebook login failed';
            setAuthError(message);
        }
    };

    return (
        <main className={styles.main}>
            {/* Top Navbar */}
            <nav className={styles.navbar}>
                <div className={styles.navLeft}>
                    <div className={styles.logo}>FlowFic</div>
                    <div className={styles.navLinks}>
                        <Link href="/" className={styles.activeLink}>นิยาย</Link>
                        <Link href="/">แฟนฟิค</Link>
                        <Link href="/">การ์ตูน</Link>
                    </div>
                </div>
                <div className={styles.navRight}>
                    <button className={styles.iconBtn}><Search size={18} /></button>
                    <Link href="/pricing" className={styles.pricingLink}>แพ็กเกจ</Link>
                    <Link href="/dashboard" className={styles.dashboardLink}>แดชบอร์ดนักเขียน</Link>

                    {isLoadingAuth ? (
                        <div className={styles.authLoading}>...</div>
                    ) : user ? (
                        <div className={styles.userProfile}>
                            {user.user_metadata?.avatar_url ? (
                                <img src={user.user_metadata.avatar_url} alt="Profile" className={styles.userAvatar} />
                            ) : (
                                <div className={styles.userAvatarPlaceholder}>{user.email?.charAt(0).toUpperCase() || 'U'}</div>
                            )}
                            <span className={styles.userName}>{user.user_metadata?.full_name || user.email?.split('@')[0]}</span>
                            <button onClick={signOut} className={styles.logoutBtn}>ออกจากระบบ</button>
                        </div>
                    ) : (
                        <div className={styles.authButtons}>
                            <button onClick={handleGoogleSignIn} className={styles.googleBtn}>
                                <img src="/google-logo.svg" alt="G" className={styles.providerIcon} onError={(e) => e.currentTarget.style.display = 'none'} />
                                เข้าระบบด้วย Google
                            </button>
                            <button onClick={handleFacebookSignIn} className={styles.loginBtn}>
                                <img src="/facebook-logo.svg" alt="f" className={styles.providerIcon} onError={(e) => e.currentTarget.style.display = 'none'} />
                                Facebook
                            </button>
                        </div>
                    )}

                    <button className={styles.mobileMenuBtn}><Menu size={24} /></button>
                </div>
            </nav>

            <div className={styles.content}>
                {authError && (
                    <div className={styles.emptyMyNovels} style={{ color: '#b00020' }}>
                        Login error: {authError}
                    </div>
                )}
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>นิยายที่เผยแพร่ล่าสุด</h2>
                        <span className={styles.viewAll}>{filteredStories.length} เรื่อง</span>
                    </div>

                    {/* Category Filters */}
                    <div className={styles.categoryFilters}>
                        <button
                            className={`${styles.filterBtn} ${selectedCategory === 'all' ? styles.activeFilter : ''}`}
                            onClick={() => setSelectedCategory('all')}
                        >
                            ทั้งหมด
                        </button>
                        {MAIN_CATEGORIES.map(category => (
                            <button
                                key={category.id}
                                className={`${styles.filterBtn} ${selectedCategory === category.id ? styles.activeFilter : ''}`}
                                onClick={() => setSelectedCategory(category.id)}
                            >
                                {category.label}
                            </button>
                        ))}
                    </div>

                    {isLoading ? (
                        <div className={styles.emptyMyNovels}>กำลังโหลดข้อมูลจากฐานข้อมูล...</div>
                    ) : filteredStories.length === 0 ? (
                        <div className={styles.emptyMyNovels}>ไม่พบหน้าที่มีหมวดหมู่นี้</div>
                    ) : (
                        <div className={styles.storiesGrid}>
                            {stories.map(story => (
                                <Link key={story.id} href={`/story/${story.id}`} className={styles.storyCard}>
                                    <div className={styles.storyCoverWrap}>
                                        {story.cover_url ? (
                                            <img src={story.cover_url} alt={story.title} className={styles.storyCover} />
                                        ) : (
                                            <div className={styles.storyCoverPlaceholder}>No Cover</div>
                                        )}
                                    </div>
                                    <div className={styles.storyInfo}>
                                        <h3 className={styles.storyTitle}>{story.title}</h3>
                                        <p className={styles.storyAuthor}>{story.pen_name}</p>
                                        <div className={styles.storyBadges}>
                                            <span className={styles.storyBadge}>
                                                {story.category === 'fanfic' ? 'แฟนฟิค' : 'ออริจินัล'}
                                            </span>
                                            {story.main_category && (
                                                <span className={styles.storyBadge}>
                                                    {MAIN_CATEGORIES.find(c => c.id === story.main_category)?.label || story.main_category}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
