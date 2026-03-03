'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    Heart,
    Eye,
    MessageSquare,
    Bookmark,
    Plus,
    PenTool,
    Image as ImageIcon,
    Sparkles,
    Settings,
    X,
    Upload,
    Edit3,
    MoreVertical,
    Trash2,
    LogOut,
    User,
    BookOpen
} from 'lucide-react';
import styles from './dashboard.module.css';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

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

type UserProfile = {
    pen_name: string;
    bio: string;
    avatar_url: string | null;
};

type StoryStatus = 'draft' | 'published';

type StoryMetrics = {
    views: number;
    likes: number;
    comments: number;
    favorites: number;
};

type DashboardStory = {
    id: string;
    title: string;
    coverUrl: string;
    type: 'fanfic' | 'cartoon' | 'novel';
    penName: string;
    synopsis: string | null;
    status: StoryStatus;
    completionStatus: string;
    createdAt: string | null;
    viewsCount: number;
    likesCount: number;
    commentsCount: number;
    favoritesCount: number;
};

type ChapterReadRow = {
    story_id: string;
    read_count: number | null;
};

type StoryIdRow = {
    story_id: string;
};

type ChapterContentRow = {
    content: unknown;
};

type CharacterImageRow = {
    image_url: string | null;
};

type StoryCoverRow = {
    cover_url: string | null;
};

const extractStoragePath = (publicUrl: string | null | undefined, bucket: 'covers' | 'characters' | 'comics') => {
    if (!publicUrl) return null;
    const marker = `/public/${bucket}/`;
    const markerIndex = publicUrl.indexOf(marker);
    if (markerIndex === -1) return null;

    const pathWithQuery = publicUrl.slice(markerIndex + marker.length);
    const [path] = pathWithQuery.split('?');
    return path ? decodeURIComponent(path) : null;
};

const collectMediaUrlsFromChapterContent = (content: unknown) => {
    const urls: string[] = [];
    if (typeof content === 'string') {
        try {
            return collectMediaUrlsFromChapterContent(JSON.parse(content));
        } catch {
            return urls;
        }
    }
    if (!content || typeof content !== 'object') return urls;

    const record = content as Record<string, unknown>;

    if (Array.isArray(record.pages)) {
        record.pages.forEach((item) => {
            if (typeof item === 'string') urls.push(item);
        });
    }

    if (Array.isArray(record.blocks)) {
        record.blocks.forEach((block) => {
            if (!block || typeof block !== 'object') return;
            const imageUrl = (block as Record<string, unknown>).imageUrl;
            if (typeof imageUrl === 'string') {
                urls.push(imageUrl);
            }
        });
    }

    return urls;
};

const removeStoragePaths = async (bucket: 'covers' | 'characters' | 'comics', paths: string[]) => {
    const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
    if (uniquePaths.length === 0) return { ok: true as const };

    for (let i = 0; i < uniquePaths.length; i += 100) {
        const chunk = uniquePaths.slice(i, i + 100);
        const { error } = await supabase.storage.from(bucket).remove(chunk);
        if (error) {
            return { ok: false as const, error: error.message };
        }
    }

    return { ok: true as const };
};

export default function DashboardPage() {
    const router = useRouter();
    const { user, isLoading: isLoadingAuth, signOut } = useAuth();
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState('all');
    const [dbStories, setDbStories] = useState<DBStoryRow[]>([]);
    const [storyMetrics, setStoryMetrics] = useState<Record<string, StoryMetrics>>({});

    // Real stats
    const [totalViews, setTotalViews] = useState(0);
    const [totalLikes, setTotalLikes] = useState(0);
    const [totalFavorites, setTotalFavorites] = useState(0);
    const [totalComments, setTotalComments] = useState(0);

    // Profile State
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [profile, setProfile] = useState<UserProfile>({ pen_name: 'Flow Writer', bio: '', avatar_url: null });
    const [editProfile, setEditProfile] = useState<UserProfile>({ pen_name: '', bio: '', avatar_url: null });
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Story Info Modal State
    const [isStoryInfoModalOpen, setIsStoryInfoModalOpen] = useState(false);
    const [selectedStory, setSelectedStory] = useState<DashboardStory | null>(null);
    const [isUpdatingStoryStatus, setIsUpdatingStoryStatus] = useState<Record<string, boolean>>({});
    const [openStoryMenuId, setOpenStoryMenuId] = useState<string | null>(null);

    // Fetch real stories and profile from Supabase
    useEffect(() => {
        const fetchDashboardData = async () => {
            if (!user) return;

            const { data: storyData } = await supabase
                .from('stories')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (storyData) {
                setDbStories(storyData);

                const storyIds = storyData.map(s => s.id);

                if (storyIds.length > 0) {
                    const initialMetrics: Record<string, StoryMetrics> = Object.fromEntries(
                        storyIds.map((id) => [id, { views: 0, likes: 0, comments: 0, favorites: 0 }])
                    );

                    const [
                        { data: chaptersData },
                        { data: likesData },
                        { data: favoritesData },
                        { data: commentsData },
                    ] = await Promise.all([
                        supabase.from('chapters').select('story_id, read_count').in('story_id', storyIds),
                        supabase.from('likes').select('story_id').in('story_id', storyIds),
                        supabase.from('favorites').select('story_id').in('story_id', storyIds),
                        supabase.from('comments').select('story_id').in('story_id', storyIds),
                    ]);

                    (chaptersData as ChapterReadRow[] | null)?.forEach((row) => {
                        if (initialMetrics[row.story_id]) {
                            initialMetrics[row.story_id].views += row.read_count || 0;
                        }
                    });

                    (likesData as StoryIdRow[] | null)?.forEach((row) => {
                        if (initialMetrics[row.story_id]) {
                            initialMetrics[row.story_id].likes += 1;
                        }
                    });

                    (favoritesData as StoryIdRow[] | null)?.forEach((row) => {
                        if (initialMetrics[row.story_id]) {
                            initialMetrics[row.story_id].favorites += 1;
                        }
                    });

                    (commentsData as StoryIdRow[] | null)?.forEach((row) => {
                        if (initialMetrics[row.story_id]) {
                            initialMetrics[row.story_id].comments += 1;
                        }
                    });

                    setStoryMetrics(initialMetrics);

                    const metricList = Object.values(initialMetrics);
                    setTotalViews(metricList.reduce((sum, metric) => sum + metric.views, 0));
                    setTotalLikes(metricList.reduce((sum, metric) => sum + metric.likes, 0));
                    setTotalFavorites(metricList.reduce((sum, metric) => sum + metric.favorites, 0));
                    setTotalComments(metricList.reduce((sum, metric) => sum + metric.comments, 0));
                } else {
                    setStoryMetrics({});
                    setTotalViews(0);
                    setTotalLikes(0);
                    setTotalFavorites(0);
                    setTotalComments(0);
                }
            }

            const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (profileData) {
                setProfile({
                    pen_name: profileData.pen_name || user.user_metadata?.full_name || 'Flow Writer',
                    bio: profileData.bio || '',
                    avatar_url: profileData.avatar_url,
                });
            } else {
                setProfile({
                    pen_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Flow Writer',
                    bio: '',
                    avatar_url: user.user_metadata?.avatar_url || null,
                });
            }
        };

        if (!isLoadingAuth) {
            if (!user) {
                router.push('/');
            } else {
                fetchDashboardData();
            }
        }
    }, [user, isLoadingAuth, router]);

    useEffect(() => {
        if (!openStoryMenuId && !isProfileMenuOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (openStoryMenuId && !target.closest('[data-story-actions="true"]')) {
                setOpenStoryMenuId(null);
            }
            if (isProfileMenuOpen && profileMenuRef.current && !profileMenuRef.current.contains(target)) {
                setIsProfileMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [openStoryMenuId, isProfileMenuOpen]);

    const handleSignOut = async () => {
        setIsProfileMenuOpen(false);
        await signOut();
        router.push('/');
    };

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

    const formatCount = (value: number) => value.toLocaleString('th-TH');

    // Map DB stories to match the display type
    const allStories: DashboardStory[] = dbStories.map((s) => {
        const metrics = storyMetrics[s.id] || { views: 0, likes: 0, comments: 0, favorites: 0 };
        return {
            id: s.id,
            title: s.title,
            coverUrl: s.cover_url || 'https://images.unsplash.com/photo-1518621736915-f3b1c41bfd00?auto=format&fit=crop&w=800&q=80',
            type: s.category === 'fanfic' ? 'fanfic' : s.category === 'cartoon' ? 'cartoon' : 'novel',
            penName: s.pen_name,
            synopsis: s.synopsis,
            status: s.status === 'published' ? 'published' : 'draft',
            completionStatus: s.completion_status || 'ongoing',
            createdAt: s.created_at,
            viewsCount: metrics.views,
            likesCount: metrics.likes,
            commentsCount: metrics.comments,
            favoritesCount: metrics.favorites,
        };
    });

    const filteredStories = activeTab === 'all'
        ? allStories
        : allStories.filter(s => s.type === activeTab);

    const handleStoryStatusChange = async (storyId: string, nextStatus: StoryStatus) => {
        if (!user) return;

        const previousStatus = dbStories.find((story) => story.id === storyId)?.status;
        if (!previousStatus || previousStatus === nextStatus) return;

        setIsUpdatingStoryStatus((prev) => ({ ...prev, [storyId]: true }));
        setDbStories((prev) =>
            prev.map((story) => (story.id === storyId ? { ...story, status: nextStatus } : story))
        );

        if (selectedStory?.id === storyId) {
            setSelectedStory((prev) => (prev ? { ...prev, status: nextStatus } : prev));
        }

        const { error } = await supabase
            .from('stories')
            .update({ status: nextStatus })
            .eq('id', storyId)
            .eq('user_id', user.id);

        if (error) {
            setDbStories((prev) =>
                prev.map((story) => (story.id === storyId ? { ...story, status: previousStatus } : story))
            );

            if (selectedStory?.id === storyId) {
                setSelectedStory((prev) =>
                    prev ? { ...prev, status: previousStatus === 'published' ? 'published' : 'draft' } : prev
                );
            }

            alert('อัปเดตสถานะเรื่องไม่สำเร็จ กรุณาลองใหม่');
        }

        setIsUpdatingStoryStatus((prev) => ({ ...prev, [storyId]: false }));
    };

    const handleDeleteStory = async (story: DashboardStory) => {
        if (!user) return;

        const confirmed = window.confirm(`ต้องการลบเรื่อง "${story.title}" ใช่หรือไม่?\nการลบนี้ไม่สามารถย้อนกลับได้`);
        if (!confirmed) return;

        setOpenStoryMenuId(null);

        const [{ data: storyRow }, { data: chapterRows }, { data: characterRows }] = await Promise.all([
            supabase
                .from('stories')
                .select('cover_url')
                .eq('id', story.id)
                .eq('user_id', user.id)
                .maybeSingle(),
            supabase
                .from('chapters')
                .select('content')
                .eq('story_id', story.id),
            supabase
                .from('characters')
                .select('image_url')
                .eq('story_id', story.id),
        ]);

        const coverPaths: string[] = [];
        const characterPaths: string[] = [];
        const comicPaths: string[] = [];

        const coverPath = extractStoragePath((storyRow as StoryCoverRow | null)?.cover_url, 'covers');
        if (coverPath) coverPaths.push(coverPath);

        (characterRows as CharacterImageRow[] | null)?.forEach((row) => {
            const path = extractStoragePath(row.image_url, 'characters');
            if (path) characterPaths.push(path);
        });

        (chapterRows as ChapterContentRow[] | null)?.forEach((row) => {
            const mediaUrls = collectMediaUrlsFromChapterContent(row.content);
            mediaUrls.forEach((url) => {
                const coverMediaPath = extractStoragePath(url, 'covers');
                if (coverMediaPath) coverPaths.push(coverMediaPath);

                const comicMediaPath = extractStoragePath(url, 'comics');
                if (comicMediaPath) comicPaths.push(comicMediaPath);
            });
        });

        const [coversResult, charactersResult, comicsResult] = await Promise.all([
            removeStoragePaths('covers', coverPaths),
            removeStoragePaths('characters', characterPaths),
            removeStoragePaths('comics', comicPaths),
        ]);

        const deleteErrors: string[] = [];
        if (!coversResult.ok) deleteErrors.push(coversResult.error);
        if (!charactersResult.ok) deleteErrors.push(charactersResult.error);
        if (!comicsResult.ok) deleteErrors.push(comicsResult.error);

        if (deleteErrors.length > 0) {
            alert('ลบไฟล์รูปภาพของเรื่องไม่สำเร็จ กรุณาลองใหม่');
            return;
        }

        const { error } = await supabase
            .from('stories')
            .delete()
            .eq('id', story.id)
            .eq('user_id', user.id);

        if (error) {
            alert('ลบเรื่องไม่สำเร็จ กรุณาลองใหม่');
            return;
        }

        setDbStories((prev) => prev.filter((row) => row.id !== story.id));
        setStoryMetrics((prev) => {
            const next = { ...prev };
            delete next[story.id];
            return next;
        });

        setTotalViews((prev) => Math.max(0, prev - story.viewsCount));
        setTotalLikes((prev) => Math.max(0, prev - story.likesCount));
        setTotalFavorites((prev) => Math.max(0, prev - story.favoritesCount));
        setTotalComments((prev) => Math.max(0, prev - story.commentsCount));

        if (selectedStory?.id === story.id) {
            setSelectedStory(null);
            setIsStoryInfoModalOpen(false);
        }
    };

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
                </div>
            </nav>

            <div className={styles.content}>

                {/* Welcome Section */}
                <div className={styles.welcomeSection}>
                    <h1 className={styles.greeting}>สวัสดี, {profile.pen_name} 👋</h1>
                    <p className={styles.subtitle}>{profile.bio || 'ภาพรวมผลงานและนิยายของคุณ'}</p>
                    <button
                        onClick={handleOpenProfileModal}
                        style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'none', border: 'none', color: '#64748b', fontSize: '0.85rem', cursor: 'pointer', width: 'fit-content' }}
                    >
                        <Settings size={14} /> ตั้งค่าโปรไฟล์นักเขียน
                    </button>
                </div>

                {/* Stats Grid — Real Data */}
                <div className={styles.statsGrid}>
                    <div className={styles.statCard}>
                        <div className={styles.statIconWrapper} style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                            <Eye size={24} />
                        </div>
                        <div className={styles.statInfo}>
                            <p className={styles.statLabel}>ยอดวิวรวม</p>
                            <h3 className={styles.statValue}>{totalViews.toLocaleString()}</h3>
                        </div>
                    </div>

                    <div className={styles.statCard}>
                        <div className={styles.statIconWrapper} style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                            <Heart size={24} />
                        </div>
                        <div className={styles.statInfo}>
                            <p className={styles.statLabel}>หัวใจทั้งหมด</p>
                            <h3 className={styles.statValue}>{totalLikes.toLocaleString()}</h3>
                        </div>
                    </div>

                    <div className={styles.statCard}>
                        <div className={styles.statIconWrapper} style={{ backgroundColor: 'rgba(28, 198, 172, 0.1)', color: 'var(--primary)' }}>
                            <Bookmark size={24} />
                        </div>
                        <div className={styles.statInfo}>
                            <p className={styles.statLabel}>เก็บเข้าชั้น</p>
                            <h3 className={styles.statValue}>{totalFavorites.toLocaleString()}</h3>
                        </div>
                    </div>

                    <div className={styles.statCard}>
                        <div className={styles.statIconWrapper} style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                            <MessageSquare size={24} />
                        </div>
                        <div className={styles.statInfo}>
                            <p className={styles.statLabel}>คอมเมนต์</p>
                            <h3 className={styles.statValue}>{totalComments.toLocaleString()}</h3>
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className={styles.mainGrid}>

                    {/* Active Stories */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <h2 className={styles.cardTitle}>นิยายของคุณ ({allStories.length})</h2>
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
                            {filteredStories.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                                    <p>ยังไม่มีนิยาย</p>
                                    <Link href="/story/create" style={{ color: 'var(--primary)', fontWeight: 600 }}>+ สร้างเรื่องใหม่</Link>
                                </div>
                            ) : (
                                filteredStories.map((story) => {
                                    const timeAgo = story.createdAt
                                        ? `สร้างเมื่อ ${new Date(story.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}`
                                        : '';

                                    return (
                                        <div key={story.id} className={styles.storyListItem}>
                                            <img src={story.coverUrl} alt={story.title} className={styles.storyThumb} />

                                            <div className={styles.storyDetails}>
                                                <div className={styles.titleRow}>
                                                    <h4 className={styles.storyTitle} style={{ fontSize: '1.1rem' }}>{story.title}</h4>
                                                    {story.type === 'fanfic' && <span className={styles.badgeFanfic}>Fanfic</span>}
                                                    {story.type === 'novel' && <span className={styles.badgeNovel}>Original</span>}
                                                    {story.type === 'cartoon' && <span className={styles.badgeCartoon}>Cartoon</span>}
                                                    {story.completionStatus === 'completed' ? (
                                                        <span className={styles.badgeCompleted} style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}>Completed</span>
                                                    ) : (
                                                        <span className={styles.badgeOngoing} style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}>Ongoing</span>
                                                    )}
                                                </div>
                                                <div className={styles.storyMeta}>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Eye size={12} /> {formatCount(story.viewsCount)}</span>
                                                    <span style={{ margin: '0 0.5rem', color: '#cbd5e1' }}>•</span>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Heart size={12} /> {formatCount(story.likesCount)}</span>
                                                    <span style={{ margin: '0 0.5rem', color: '#cbd5e1' }}>•</span>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><MessageSquare size={12} /> {formatCount(story.commentsCount)}</span>
                                                    <span style={{ margin: '0 0.5rem', color: '#cbd5e1' }}>•</span>
                                                    <span>{timeAgo}</span>
                                                </div>
                                            </div>

                                            <div className={styles.storyTimeArea}>
                                                <span>สร้างเมื่อ</span>
                                                <span>{story.createdAt ? new Date(story.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : 'ไม่ทราบ'}</span>
                                            </div>

                                            <div className={styles.publishDropdownContainer}>
                                                <select
                                                    className={`${styles.publishDropdownSelect} ${story.status === 'published' ? styles.public : styles.private}`}
                                                    value={story.status === 'published' ? 'published' : 'draft'}
                                                    onChange={(e) => handleStoryStatusChange(story.id, e.target.value as StoryStatus)}
                                                    disabled={!!isUpdatingStoryStatus[story.id]}
                                                    aria-label={`สถานะการเผยแพร่ของเรื่อง ${story.title}`}
                                                >
                                                    <option value="published">เผยแพร่</option>
                                                    <option value="draft">ไม่เผยแพร่</option>
                                                </select>
                                            </div>

                                            <div className={styles.actionsContainer} data-story-actions="true">
                                                <Link href={`/story/manage/${story.id}`} className={styles.editBtn}>
                                                    <Edit3 size={14} /> แก้ไขเนื้อหา
                                                </Link>
                                                <button
                                                    type="button"
                                                    className={styles.moreMenuBtn}
                                                    title="เมนูเพิ่มเติม"
                                                    onClick={() => {
                                                        setOpenStoryMenuId((prev) => (prev === story.id ? null : story.id));
                                                    }}
                                                >
                                                    <MoreVertical size={18} />
                                                </button>
                                                {openStoryMenuId === story.id && (
                                                    <div className={styles.storyActionMenu}>
                                                        <button
                                                            type="button"
                                                            className={styles.storyActionMenuItem}
                                                            onClick={() => {
                                                                setSelectedStory(story);
                                                                setIsStoryInfoModalOpen(true);
                                                                setOpenStoryMenuId(null);
                                                            }}
                                                        >
                                                            ดูรายละเอียด
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={`${styles.storyActionMenuItem} ${styles.storyActionMenuItemDanger}`}
                                                            onClick={() => handleDeleteStory(story)}
                                                        >
                                                            ลบ
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                </div>
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

            {/* Story Info Modal */}
            {isStoryInfoModalOpen && selectedStory && (
                <div className={styles.modalOverlay} onClick={() => setIsStoryInfoModalOpen(false)}>
                    <div className={`${styles.modalContent} ${styles.storyModal}`} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2>รายละเอียดเรื่อง</h2>
                            <button className={styles.closeBtn} onClick={() => setIsStoryInfoModalOpen(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            <div className={styles.storyInfoGrid}>
                                <img src={selectedStory.coverUrl} alt="Cover" className={styles.storyInfoCover} />
                                <div className={styles.storyInfoDetails}>
                                    <h3 className={styles.storyInfoTitle}>{selectedStory.title}</h3>
                                    <div className={styles.titleRow} style={{ marginBottom: '0.5rem' }}>
                                        {selectedStory.type === 'fanfic' && <span className={styles.badgeFanfic}>Fanfic</span>}
                                        {selectedStory.type === 'novel' && <span className={styles.badgeNovel}>Original</span>}
                                        {selectedStory.type === 'cartoon' && <span className={styles.badgeCartoon}>Cartoon</span>}
                                        {selectedStory.status === 'draft' && <span className={styles.badgeDraft}>Draft</span>}
                                        {selectedStory.completionStatus === 'completed' ? (
                                            <span className={styles.badgeCompleted}>Completed</span>
                                        ) : (
                                            <span className={styles.badgeOngoing}>Ongoing</span>
                                        )}
                                    </div>

                                    <div className={styles.storyInfoMetaGrid}>
                                        <div className={styles.storyInfoMetaItem}>
                                            <span className={styles.storyInfoMetaLabel}>ยอดเข้าชมรวม</span>
                                            <span className={styles.storyInfoMetaValue}><Eye size={14} /> {formatCount(selectedStory.viewsCount)}</span>
                                        </div>
                                        <div className={styles.storyInfoMetaItem}>
                                            <span className={styles.storyInfoMetaLabel}>ยอดใจรวม</span>
                                            <span className={styles.storyInfoMetaValue}><Heart size={14} /> {formatCount(selectedStory.likesCount)}</span>
                                        </div>
                                        <div className={styles.storyInfoMetaItem}>
                                            <span className={styles.storyInfoMetaLabel}>เก็บเข้าชั้น</span>
                                            <span className={styles.storyInfoMetaValue}><Bookmark size={14} /> {formatCount(selectedStory.favoritesCount)}</span>
                                        </div>
                                        <div className={styles.storyInfoMetaItem}>
                                            <span className={styles.storyInfoMetaLabel}>ความคิดเห็น</span>
                                            <span className={styles.storyInfoMetaValue}><MessageSquare size={14} /> {formatCount(selectedStory.commentsCount)}</span>
                                        </div>
                                    </div>

                                    <div className={styles.storyInfoMetaItem} style={{ marginTop: '0.5rem' }}>
                                        <span className={styles.storyInfoMetaLabel}>อัปเดตล่าสุด</span>
                                        <span className={styles.storyInfoMetaValue}>
                                            {selectedStory.createdAt ? new Date(selectedStory.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {selectedStory.synopsis && (
                                <div className={styles.storyInfoMetaItem}>
                                    <span className={styles.storyInfoMetaLabel}>เรื่องย่อ</span>
                                    <div className={styles.storyInfoDesc}>
                                        {selectedStory.synopsis}
                                    </div>
                                </div>
                            )}

                        </div>
                        <div className={styles.modalFooter}>
                            <button type="button" className={styles.dangerBtn} onClick={() => handleDeleteStory(selectedStory)}>
                                <Trash2 size={16} /> ลบเรื่องนี้
                            </button>
                            <button type="button" className={styles.cancelBtn} onClick={() => setIsStoryInfoModalOpen(false)}>
                                ปิด
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
