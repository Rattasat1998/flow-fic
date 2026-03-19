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
    Settings,
    X,
    Upload,
    Edit3,
    MoreVertical,
    Trash2,
    ChevronDown,
} from 'lucide-react';
import styles from './dashboard.module.css';
import { supabase } from '@/lib/supabase';
import { MAIN_CATEGORIES } from '@/lib/categories';
import { useAuth } from '@/contexts/AuthContext';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { WalletLedgerPanel } from '@/components/profile/WalletLedgerPanel';

type DBStoryRow = {
    id: string;
    title: string;
    cover_url: string | null;
    cover_wide_url: string | null;
    category: string;
    main_category: string | null;
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
    mainCategory: string;
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

type DashboardMetricsRow = {
    story_id: string;
    views_count: number | null;
    likes_count: number | null;
    favorites_count: number | null;
    comments_count: number | null;
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
    cover_wide_url: string | null;
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

const isMissingWriterMetricsRpcError = (error: unknown) => {
    if (!error || typeof error !== 'object') return false;

    const maybeError = error as {
        code?: string;
        message?: string;
        details?: string;
        hint?: string;
    };

    const message = typeof maybeError.message === 'string' ? maybeError.message : '';
    const details = typeof maybeError.details === 'string' ? maybeError.details : '';
    const hint = typeof maybeError.hint === 'string' ? maybeError.hint : '';
    const combined = `${message} ${details} ${hint}`;

    return maybeError.code === 'PGRST202' || combined.includes('get_writer_dashboard_metrics');
};

export default function DashboardPage() {
    const router = useRouter();
    const { user, isLoading: isLoadingAuth } = useAuth();
    const userId = user?.id ?? null;
    const userFullName = typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '';
    const userAvatarUrl = typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null;
    const userEmailFallback = typeof user?.email === 'string' ? user.email.split('@')[0] || 'Flow Writer' : 'Flow Writer';
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<'all' | string>('all');
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
            if (!userId) return;

            const { data: storyData } = await supabase
                .from('stories')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (storyData) {
                setDbStories(storyData);

                const storyIds = storyData.map(s => s.id);

                if (storyIds.length > 0) {
                    const initialMetrics: Record<string, StoryMetrics> = Object.fromEntries(
                        storyIds.map((id) => [id, { views: 0, likes: 0, comments: 0, favorites: 0 }])
                    );

                    const applyMetrics = (nextMetrics: Record<string, StoryMetrics>) => {
                        setStoryMetrics(nextMetrics);
                        const metricList = Object.values(nextMetrics);
                        setTotalViews(metricList.reduce((sum, metric) => sum + metric.views, 0));
                        setTotalLikes(metricList.reduce((sum, metric) => sum + metric.likes, 0));
                        setTotalFavorites(metricList.reduce((sum, metric) => sum + metric.favorites, 0));
                        setTotalComments(metricList.reduce((sum, metric) => sum + metric.comments, 0));
                    };

                    const hydrateMetricsFromLegacyQueries = async () => {
                        const nextMetrics = { ...initialMetrics };
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
                            if (nextMetrics[row.story_id]) {
                                nextMetrics[row.story_id].views += row.read_count || 0;
                            }
                        });

                        (likesData as StoryIdRow[] | null)?.forEach((row) => {
                            if (nextMetrics[row.story_id]) {
                                nextMetrics[row.story_id].likes += 1;
                            }
                        });

                        (favoritesData as StoryIdRow[] | null)?.forEach((row) => {
                            if (nextMetrics[row.story_id]) {
                                nextMetrics[row.story_id].favorites += 1;
                            }
                        });

                        (commentsData as StoryIdRow[] | null)?.forEach((row) => {
                            if (nextMetrics[row.story_id]) {
                                nextMetrics[row.story_id].comments += 1;
                            }
                        });

                        return nextMetrics;
                    };

                    const { data: metricRows, error: metricError } = await supabase.rpc(
                        'get_writer_dashboard_metrics'
                    );

                    if (metricError) {
                        if (isMissingWriterMetricsRpcError(metricError)) {
                            console.warn(
                                '[Dashboard] RPC get_writer_dashboard_metrics is unavailable. Falling back to legacy metric queries.',
                                metricError
                            );
                        } else {
                            console.error('[Dashboard] RPC get_writer_dashboard_metrics failed. Falling back to legacy metric queries.', metricError);
                        }

                        const fallbackMetrics = await hydrateMetricsFromLegacyQueries();
                        applyMetrics(fallbackMetrics);
                    } else {
                        const nextMetrics = { ...initialMetrics };

                        ((metricRows as DashboardMetricsRow[] | null) || []).forEach((row) => {
                            if (!nextMetrics[row.story_id]) return;
                            nextMetrics[row.story_id] = {
                                views: Math.max(0, Number(row.views_count || 0)),
                                likes: Math.max(0, Number(row.likes_count || 0)),
                                favorites: Math.max(0, Number(row.favorites_count || 0)),
                                comments: Math.max(0, Number(row.comments_count || 0)),
                            };
                        });

                        applyMetrics(nextMetrics);
                    }
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
                .eq('id', userId)
                .single();

            if (profileData) {
                setProfile({
                    pen_name: profileData.pen_name || userFullName || 'Flow Writer',
                    bio: profileData.bio || '',
                    avatar_url: profileData.avatar_url,
                });
            } else {
                setProfile({
                    pen_name: userFullName || userEmailFallback,
                    bio: '',
                    avatar_url: userAvatarUrl,
                });
            }
        };

        if (!isLoadingAuth) {
            if (!userId) {
                router.push('/');
            } else {
                fetchDashboardData();
            }
        }
    }, [userAvatarUrl, userEmailFallback, userFullName, userId, isLoadingAuth, router]);

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
            coverUrl: s.cover_url || s.cover_wide_url || 'https://images.unsplash.com/photo-1518621736915-f3b1c41bfd00?auto=format&fit=crop&w=800&q=80',
            type: s.category === 'fanfic' ? 'fanfic' : s.category === 'cartoon' ? 'cartoon' : 'novel',
            mainCategory: s.main_category || '',
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
        : allStories.filter((story) => story.mainCategory === activeTab);
    const storyCountByMainCategory = allStories.reduce<Record<string, number>>((acc, story) => {
        if (!story.mainCategory) return acc;
        acc[story.mainCategory] = (acc[story.mainCategory] || 0) + 1;
        return acc;
    }, {});
    const publishedStoriesCount = allStories.filter((story) => story.status === 'published').length;
    const completedStoriesCount = allStories.filter((story) => story.completionStatus === 'completed').length;

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
                .select('cover_url, cover_wide_url')
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
        const coverWidePath = extractStoragePath((storyRow as StoryCoverRow | null)?.cover_wide_url, 'covers');
        if (coverWidePath) coverPaths.push(coverWidePath);

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
        <main className={`${styles.main} ffStudioShell`}>
            <nav className={`ffStudioTopbar ${styles.navbar}`}>
                <div className="ffStudioTopbarInner">
                    <div className={`ffStudioTopbarContext ${styles.navLeft}`}>
                        <BrandLogo href="/" size="md" className={styles.logo} withStudioLabel />
                        <span className={styles.navDivider}>/</span>
                        <div className="ffStudioTopbarCopy">
                            <span className="ffStudioTopbarEyebrow">Writer Studio</span>
                            <span className="ffStudioTopbarTitle">แดชบอร์ดนักเขียน</span>
                            <span className="ffStudioTopbarMeta">
                                ทั้งหมด {allStories.length} เรื่อง · เผยแพร่แล้ว {publishedStoriesCount} เรื่อง
                            </span>
                        </div>
                    </div>
                    <div className={`ffStudioTopbarActions ${styles.navRight}`}>
                        <Link href="/story/create" className={styles.createBtn}>
                            <Plus size={16} /> แต่งเรื่องใหม่
                        </Link>
                    </div>
                </div>
            </nav>

            <div className={`ffStudioPage ${styles.content}`}>
                <section className={`${styles.welcomeSection} ffStudioMasthead`}>
                    <div className={styles.welcomeCopy}>
                        <span className={styles.welcomeEyebrow}>Writer Overview</span>
                        <h1 className={styles.greeting}>สวัสดี, {profile.pen_name}</h1>
                        <p className={styles.subtitle}>{profile.bio || 'ภาพรวมผลงานและนิยายของคุณในสตูดิโอเขียนเรื่อง'}</p>
                        <div className={styles.welcomePills}>
                            <span className={styles.welcomePill}>ผลงานทั้งหมด {allStories.length} เรื่อง</span>
                            <span className={styles.welcomePill}>เผยแพร่แล้ว {publishedStoriesCount} เรื่อง</span>
                            <span className={styles.welcomePill}>จบแล้ว {completedStoriesCount} เรื่อง</span>
                        </div>
                    </div>
                    <div className={styles.welcomeActions}>
                        <button
                            onClick={handleOpenProfileModal}
                            className={styles.profileSettingsBtn}
                        >
                            <Settings size={14} /> ตั้งค่าโปรไฟล์นักเขียน
                        </button>
                    </div>
                </section>

                <div className={styles.statsGrid}>
                    <div className={`${styles.statCard} ffStudioPanel`}>
                        <div className={`${styles.statIconWrapper} ${styles.statToneAmber}`}>
                            <Eye size={24} />
                        </div>
                        <div className={styles.statInfo}>
                            <p className={styles.statLabel}>ยอดวิวรวม</p>
                            <h3 className={styles.statValue}>{totalViews.toLocaleString()}</h3>
                            <p className={styles.statNote}>รวมทุกเรื่องที่เผยแพร่</p>
                        </div>
                    </div>

                    <div className={`${styles.statCard} ffStudioPanel`}>
                        <div className={`${styles.statIconWrapper} ${styles.statToneRose}`}>
                            <Heart size={24} />
                        </div>
                        <div className={styles.statInfo}>
                            <p className={styles.statLabel}>หัวใจทั้งหมด</p>
                            <h3 className={styles.statValue}>{totalLikes.toLocaleString()}</h3>
                            <p className={styles.statNote}>สัญญาณตอบรับจากผู้อ่าน</p>
                        </div>
                    </div>

                    <div className={`${styles.statCard} ffStudioPanel`}>
                        <div className={`${styles.statIconWrapper} ${styles.statToneOrange}`}>
                            <Bookmark size={24} />
                        </div>
                        <div className={styles.statInfo}>
                            <p className={styles.statLabel}>เก็บเข้าชั้น</p>
                            <h3 className={styles.statValue}>{totalFavorites.toLocaleString()}</h3>
                            <p className={styles.statNote}>จำนวนครั้งที่ถูกเซฟไว้</p>
                        </div>
                    </div>

                    <div className={`${styles.statCard} ffStudioPanel`}>
                        <div className={`${styles.statIconWrapper} ${styles.statToneBlue}`}>
                            <MessageSquare size={24} />
                        </div>
                        <div className={styles.statInfo}>
                            <p className={styles.statLabel}>คอมเมนต์</p>
                            <h3 className={styles.statValue}>{totalComments.toLocaleString()}</h3>
                            <p className={styles.statNote}>บทสนทนาจากผู้อ่านทั้งหมด</p>
                        </div>
                    </div>
                </div>

                <div className={styles.mainGrid}>
                    <section className={`${styles.card} ffStudioPanel`}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardHeaderCopy}>
                                <span className={styles.cardEyebrow}>Story Library</span>
                                <h2 className={styles.cardTitle}>นิยายของคุณ ({allStories.length})</h2>
                                <p className={styles.cardSubtitle}>จัดการสถานะการเผยแพร่และเข้าไปแก้ไขแต่ละเรื่องได้จากรายการนี้</p>
                            </div>
                        </div>

                        <div className={styles.tabsContainer}>
                            <button
                                className={`${styles.tabBtn} ${activeTab === 'all' ? styles.activeTab : ''}`}
                                onClick={() => setActiveTab('all')}
                            >
                                <span>ทั้งหมด</span>
                                <span className={styles.tabBadge}>{formatCount(allStories.length)}</span>
                            </button>
                            {MAIN_CATEGORIES.map((category) => (
                                <button
                                    key={category.id}
                                    className={`${styles.tabBtn} ${activeTab === category.id ? styles.activeTab : ''}`}
                                    onClick={() => setActiveTab(category.id)}
                                >
                                    <span>{category.label}</span>
                                    <span className={styles.tabBadge}>
                                        {formatCount(storyCountByMainCategory[category.id] || 0)}
                                    </span>
                                </button>
                            ))}
                        </div>

                        <div className={styles.storyList}>
                            {filteredStories.length === 0 ? (
                                <div className={`ffStudioEmpty ${styles.emptyStories}`}>
                                    <p>ยังไม่มีนิยายในหมวดนี้</p>
                                    <Link href="/story/create" className={styles.emptyStoriesLink}>+ สร้างเรื่องใหม่</Link>
                                </div>
                            ) : (
                                filteredStories.map((story) => {
                                    const createdDate = story.createdAt
                                        ? new Date(story.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
                                        : 'ไม่ทราบ';

                                    return (
                                        <div key={story.id} className={styles.storyListItem}>
                                            <img src={story.coverUrl} alt={story.title} className={styles.storyThumb} />

                                            <div className={styles.storyContent}>
                                                <div className={styles.storyDetails}>
                                                    <div className={styles.titleRow}>
                                                        <h4 className={styles.storyTitle}>{story.title}</h4>
                                                        {story.type === 'fanfic' && <span className={styles.badgeFanfic}>Fanfic</span>}
                                                        {story.type === 'novel' && <span className={styles.badgeNovel}>Original</span>}
                                                        {story.type === 'cartoon' && <span className={styles.badgeCartoon}>Cartoon</span>}
                                                        {story.completionStatus === 'completed' ? (
                                                            <span className={styles.badgeCompleted}>Completed</span>
                                                        ) : (
                                                            <span className={styles.badgeOngoing}>Ongoing</span>
                                                        )}
                                                    </div>
                                                    <p className={styles.storySynopsis}>
                                                        {story.synopsis?.trim() || 'ยังไม่ได้เพิ่มคำโปรยเรื่อง'}
                                                    </p>
                                                    <div className={styles.storyMeta}>
                                                        <span className={styles.storyMetaItem}><Eye size={12} /> {formatCount(story.viewsCount)}</span>
                                                        <span className={styles.storyMetaDivider}>•</span>
                                                        <span className={styles.storyMetaItem}><Heart size={12} /> {formatCount(story.likesCount)}</span>
                                                        <span className={styles.storyMetaDivider}>•</span>
                                                        <span className={styles.storyMetaItem}><MessageSquare size={12} /> {formatCount(story.commentsCount)}</span>
                                                        <span className={styles.storyMetaDivider}>•</span>
                                                        <span className={styles.storyMetaItem}>สร้างเมื่อ {createdDate}</span>
                                                    </div>
                                                </div>

                                                <div className={styles.storySide}>
                                                    <div
                                                        className={`${styles.publishDropdownContainer} ${story.status === 'published' ? styles.public : styles.private}`}
                                                    >
                                                        <span className={styles.publishDropdownStatusDot} aria-hidden="true" />
                                                        <select
                                                            className={styles.publishDropdownSelect}
                                                            value={story.status === 'published' ? 'published' : 'draft'}
                                                            onChange={(e) => handleStoryStatusChange(story.id, e.target.value as StoryStatus)}
                                                            disabled={!!isUpdatingStoryStatus[story.id]}
                                                            aria-label={`สถานะการเผยแพร่ของเรื่อง ${story.title}`}
                                                        >
                                                            <option value="published">เผยแพร่</option>
                                                            <option value="draft">ไม่เผยแพร่</option>
                                                        </select>
                                                        <ChevronDown size={14} className={styles.publishDropdownCaret} aria-hidden="true" />
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
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </section>
                </div>
            </div>

            {/* Profile Modal */}
            {isProfileModalOpen && (
                <div className={styles.modalOverlay}>
                    <div className={`${styles.modalContent} ${styles.profileModalWide}`}>
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

                            <WalletLedgerPanel userId={user?.id ?? null} />
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
                                    <span className={styles.storyInfoMetaLabel}>คำโปรย</span>
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
