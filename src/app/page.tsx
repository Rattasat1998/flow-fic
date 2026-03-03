'use client';

import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { Search, Menu, PenTool, Bookmark, Heart, Settings, LogOut, Upload, X } from 'lucide-react';
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

type UserProfile = {
    pen_name: string;
    bio: string;
    avatar_url: string | null;
};

export default function HomePage() {
    const { user, isLoading: isLoadingAuth, signInWithFacebook, signInWithGoogle, signOut } = useAuth();
    const [stories, setStories] = useState<HomeStory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [authError, setAuthError] = useState<string | null>(null);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef<HTMLDivElement>(null);

    // Profile Settings State
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [profile, setProfile] = useState<UserProfile>({ pen_name: 'Flow Writer', bio: '', avatar_url: null });
    const [editProfile, setEditProfile] = useState<UserProfile>({ pen_name: '', bio: '', avatar_url: null });
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const fetchProfile = async () => {
            if (!user) return;
            const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
            if (data) {
                setProfile(data as UserProfile);
            }
        };
        fetchProfile();
    }, [user]);

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setAvatarFile(file);
            setAvatarPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleOpenProfileModal = () => {
        setEditProfile({ ...profile });
        setAvatarPreviewUrl(profile.avatar_url);
        setAvatarFile(null);
        setIsProfileModalOpen(true);
    };

    const handleSaveProfile = async () => {
        if (!user) return;
        setIsSavingProfile(true);

        try {
            let newAvatarUrl = editProfile.avatar_url;

            if (avatarFile) {
                const fileExt = avatarFile.name.split('.').pop();
                const fileName = `${user.id}-${Math.random()}.${fileExt}`;

                const { error: uploadError } = await supabase.storage
                    .from('avatars')
                    .upload(fileName, avatarFile);

                if (uploadError) throw uploadError;

                const { data: publicUrlData } = supabase.storage
                    .from('avatars')
                    .getPublicUrl(fileName);

                newAvatarUrl = publicUrlData.publicUrl;
            }

            const { error: upsertError } = await supabase
                .from('profiles')
                .upsert({
                    id: user.id,
                    pen_name: editProfile.pen_name,
                    bio: editProfile.bio,
                    avatar_url: newAvatarUrl,
                    updated_at: new Date().toISOString()
                });

            if (upsertError) throw upsertError;

            setProfile({
                pen_name: editProfile.pen_name,
                bio: editProfile.bio,
                avatar_url: newAvatarUrl
            });
            setIsProfileModalOpen(false);
        } catch (error) {
            console.error('Error saving profile:', error);
            alert('ไม่สามารถบันทึกโปรไฟล์ได้ กรุณาลองใหม่');
        } finally {
            setIsSavingProfile(false);
        }
    };

    useEffect(() => {
        if (!isProfileMenuOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as HTMLElement)) {
                setIsProfileMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isProfileMenuOpen]);

    const handleSignOut = async () => {
        setIsProfileMenuOpen(false);
        await signOut();
    };

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
                        <div className={styles.profileMenuWrapper} ref={profileMenuRef}>
                            <div className={styles.profileAvatarBtn} onClick={() => setIsProfileMenuOpen(prev => !prev)}>
                                {user.user_metadata?.avatar_url ? (
                                    <img src={user.user_metadata.avatar_url} alt="Profile" className={styles.userAvatar} />
                                ) : (
                                    <div className={styles.userAvatarPlaceholder}>{user.email?.charAt(0).toUpperCase() || 'U'}</div>
                                )}
                            </div>

                            {isProfileMenuOpen && (
                                <div className={styles.profileDropdown}>
                                    <div className={styles.profileDropdownHeader}>
                                        <div className={styles.profileDropdownAvatar}>
                                            {user.user_metadata?.avatar_url ? (
                                                <img src={user.user_metadata.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                                            ) : (
                                                (user.email?.charAt(0) || 'U').toUpperCase()
                                            )}
                                        </div>
                                        <div className={styles.profileDropdownInfo}>
                                            <div className={styles.profileDropdownName}>{user.user_metadata?.full_name || user.email?.split('@')[0]}</div>
                                            <div className={styles.profileDropdownEmail}>{user.email || ''}</div>
                                        </div>
                                    </div>

                                    <div className={styles.profileDropdownDivider} />

                                    <Link href="/dashboard" className={styles.profileDropdownItem} onClick={() => setIsProfileMenuOpen(false)}>
                                        <PenTool size={16} /> แดชบอร์ดนักเขียน
                                    </Link>
                                    <Link href="/bookshelf" className={styles.profileDropdownItem} onClick={() => setIsProfileMenuOpen(false)}>
                                        <Bookmark size={16} /> ชั้นหนังสือ
                                    </Link>
                                    <Link href="/loves" className={styles.profileDropdownItem} onClick={() => setIsProfileMenuOpen(false)}>
                                        <Heart size={16} /> รักเลย
                                    </Link>
                                    <button className={styles.profileDropdownItem} onClick={() => { setIsProfileMenuOpen(false); handleOpenProfileModal(); }}>
                                        <Settings size={16} /> ตั้งค่าโปรไฟล์
                                    </button>

                                    <div className={styles.profileDropdownDivider} />

                                    <button className={`${styles.profileDropdownItem} ${styles.profileDropdownLogout}`} onClick={handleSignOut}>
                                        <LogOut size={16} /> ออกจากระบบ
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className={styles.authButtons}>
                            <button onClick={handleGoogleSignIn} className={`${styles.authBtn} ${styles.googleBtn}`}>
                                <img src="/google-logo.svg" alt="G" className={styles.providerIcon} onError={(e) => e.currentTarget.style.display = 'none'} />
                                เข้าสู่ระบบด้วย Google
                            </button>
                            <button onClick={handleFacebookSignIn} className={`${styles.authBtn} ${styles.facebookBtn}`}>
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

            {/* Profile Modal */}
            {isProfileModalOpen && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <div className={styles.modalHeader}>
                            <h2>ตั้งค่าโปรไฟล์นักเขียน</h2>
                            <button className={styles.closeBtn} onClick={() => setIsProfileModalOpen(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            <div className={styles.avatarSection}>
                                {avatarPreviewUrl ? (
                                    <img src={avatarPreviewUrl} alt="Preview" className={styles.avatarPreview} />
                                ) : (
                                    <div className={styles.avatarPlaceholder}>
                                        {editProfile.pen_name.charAt(0).toUpperCase() || 'W'}
                                    </div>
                                )}
                                <input
                                    type="file"
                                    accept="image/*"
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                    onChange={handleAvatarChange}
                                />
                                <button className={styles.uploadLabel} onClick={() => fileInputRef.current?.click()}>
                                    <Upload size={16} /> เปลี่ยนรูปโปรไฟล์
                                </button>
                            </div>

                            <div className={styles.formGroup}>
                                <label>นามปากกาหลัก</label>
                                <input
                                    type="text"
                                    className={styles.inputField}
                                    value={editProfile.pen_name}
                                    onChange={(e) => setEditProfile({ ...editProfile, pen_name: e.target.value })}
                                    placeholder="เช่น Flow Writer"
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label>ประวัติย่อ / Bio</label>
                                <textarea
                                    className={styles.textareaField}
                                    value={editProfile.bio}
                                    onChange={(e) => setEditProfile({ ...editProfile, bio: e.target.value })}
                                    placeholder="เล่าเกี่ยวกับตัวคุณสั้นๆ..."
                                    rows={3}
                                />
                            </div>
                        </div>
                        <div className={styles.modalFooter}>
                            <button
                                className={styles.cancelBtn}
                                onClick={() => setIsProfileModalOpen(false)}
                                disabled={isSavingProfile}
                            >
                                ยกเลิก
                            </button>
                            <button
                                className={styles.saveBtn}
                                onClick={handleSaveProfile}
                                disabled={isSavingProfile || !editProfile.pen_name.trim()}
                            >
                                {isSavingProfile ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
