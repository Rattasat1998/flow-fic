'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
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
    Search,
} from 'lucide-react';
import styles from './dashboard.module.css';
import { supabase } from '@/lib/supabase';
import { MAIN_CATEGORIES } from '@/lib/categories';
import { useAuth } from '@/contexts/AuthContext';
import { WalletLedgerPanel } from '@/components/profile/WalletLedgerPanel';
import { SharedNavbar } from '@/components/navigation/SharedNavbar';

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
    writing_style: string | null;
    path_mode: string | null;
};

type StorySummaryRow = {
    id: string;
    main_category: string | null;
    status: string;
    completion_status: string | null;
};

type UserProfile = {
    pen_name: string;
    bio: string;
    avatar_url: string | null;
};

type StoryStatus = 'draft' | 'published';
type StoryWritingStyle = 'narrative' | 'chat' | 'visual_novel';
type StoryPathMode = 'linear' | 'branching';

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
    writingStyle: StoryWritingStyle;
    pathMode: StoryPathMode;
    viewsCount: number;
    likesCount: number;
    commentsCount: number;
    favoritesCount: number;
};

type StoryModeBadge = {
    key: 'narrative' | 'chat' | 'visual_novel' | 'interactive';
    label: string;
    className: string;
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

type StoryActionMenuState = {
    story: DashboardStory;
    top: number;
    right: number;
};

const STORIES_PER_PAGE = 20;
const SEARCH_DEBOUNCE_MS = 300;

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
            const blockRecord = block as Record<string, unknown>;
            const imageUrl = blockRecord.imageUrl;
            const backgroundUrl = blockRecord.backgroundUrl;
            const leftSceneImageUrl = blockRecord.leftSceneImageUrl;
            const rightSceneImageUrl = blockRecord.rightSceneImageUrl;
            const soloSceneImageUrl = blockRecord.soloSceneImageUrl;
            if (typeof imageUrl === 'string') {
                urls.push(imageUrl);
            }
            if (typeof backgroundUrl === 'string') {
                urls.push(backgroundUrl);
            }
            if (typeof leftSceneImageUrl === 'string') {
                urls.push(leftSceneImageUrl);
            }
            if (typeof rightSceneImageUrl === 'string') {
                urls.push(rightSceneImageUrl);
            }
            if (typeof soloSceneImageUrl === 'string') {
                urls.push(soloSceneImageUrl);
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

const parseStoryWritingStyle = (value: string | null | undefined): StoryWritingStyle =>
    value === 'chat' || value === 'visual_novel' ? value : 'narrative';

const parseStoryPathMode = (value: string | null | undefined): StoryPathMode =>
    value === 'branching' ? 'branching' : 'linear';

const getStoryModeBadges = (
    story: Pick<DashboardStory, 'writingStyle' | 'pathMode'>
): StoryModeBadge[] => {
    const badges: StoryModeBadge[] = [
        story.writingStyle === 'chat'
            ? { key: 'chat', label: 'แชท', className: styles.badgeChatStyle }
            : story.writingStyle === 'visual_novel'
                ? { key: 'visual_novel', label: 'วิชวลโนเวล', className: styles.badgeVisualNovelStyle }
            : { key: 'narrative', label: 'บรรยาย', className: styles.badgeNarrativeStyle },
    ];

    if (story.pathMode === 'branching') {
        badges.push({
            key: 'interactive',
            label: 'Interactive',
            className: styles.badgeInteractive,
        });
    }

    return badges;
};

export default function DashboardPage() {
    const router = useRouter();
    const { user, isLoading: isLoadingAuth, signOut } = useAuth();
    const userId = user?.id ?? null;
    const userFullName = typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '';
    const userAvatarUrl = typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null;
    const userEmailFallback = typeof user?.email === 'string' ? user.email.split('@')[0] || 'Flow Writer' : 'Flow Writer';

    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<'all' | string>('all');
    const [searchInput, setSearchInput] = useState('');
    const [debouncedSearchInput, setDebouncedSearchInput] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    const [dbStories, setDbStories] = useState<DBStoryRow[]>([]);
    const [storySummaryRows, setStorySummaryRows] = useState<StorySummaryRow[]>([]);
    const [storyMetrics, setStoryMetrics] = useState<Record<string, StoryMetrics>>({});
    const [filteredStoriesCount, setFilteredStoriesCount] = useState(0);
    const [isStoryListLoading, setIsStoryListLoading] = useState(false);
    const [isMetricsLoading, setIsMetricsLoading] = useState(false);

    const [portfolioRefreshKey, setPortfolioRefreshKey] = useState(0);

    // Header metrics
    const [totalViews, setTotalViews] = useState(0);
    const [totalLikes, setTotalLikes] = useState(0);
    const [totalFavorites, setTotalFavorites] = useState(0);
    const [totalComments, setTotalComments] = useState(0);

    // Shared navbar metrics
    const [walletCoinBalance, setWalletCoinBalance] = useState<number | null>(null);
    const [unreadNotifCount, setUnreadNotifCount] = useState(0);

    // Profile state
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [profile, setProfile] = useState<UserProfile>({ pen_name: 'Flow Writer', bio: '', avatar_url: null });
    const [editProfile, setEditProfile] = useState<UserProfile>({ pen_name: '', bio: '', avatar_url: null });
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Story modal state
    const [isStoryInfoModalOpen, setIsStoryInfoModalOpen] = useState(false);
    const [selectedStory, setSelectedStory] = useState<DashboardStory | null>(null);
    const [isUpdatingStoryStatus, setIsUpdatingStoryStatus] = useState<Record<string, boolean>>({});
    const [openStoryMenu, setOpenStoryMenu] = useState<StoryActionMenuState | null>(null);

    useEffect(() => {
        if (isLoadingAuth) return;
        if (!userId) {
            router.push('/');
        }
    }, [isLoadingAuth, userId, router]);

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            setDebouncedSearchInput(searchInput.trim());
        }, SEARCH_DEBOUNCE_MS);

        return () => window.clearTimeout(timeout);
    }, [searchInput]);

    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab, debouncedSearchInput]);

    useEffect(() => {
        if (!userId) {
            setUnreadNotifCount(0);
            return;
        }

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
        if (!userId) {
            setWalletCoinBalance(null);
            return;
        }

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

    useEffect(() => {
        if (!userId) return;

        let isActive = true;

        const fetchProfile = async () => {
            const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (!isActive) return;

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

        void fetchProfile();

        return () => {
            isActive = false;
        };
    }, [userAvatarUrl, userEmailFallback, userFullName, userId]);

    useEffect(() => {
        if (!userId) {
            setStorySummaryRows([]);
            return;
        }

        let isActive = true;

        const fetchStorySummary = async () => {
            const { data, error } = await supabase
                .from('stories')
                .select('id, main_category, status, completion_status')
                .eq('user_id', userId);

            if (!isActive) return;

            if (error) {
                console.error('[Dashboard] Failed to fetch story summary rows:', error);
                setStorySummaryRows([]);
                return;
            }

            setStorySummaryRows((data as StorySummaryRow[] | null) || []);
        };

        void fetchStorySummary();

        return () => {
            isActive = false;
        };
    }, [portfolioRefreshKey, userId]);

    useEffect(() => {
        if (!userId) {
            setDbStories([]);
            setFilteredStoriesCount(0);
            setIsStoryListLoading(false);
            return;
        }

        let isActive = true;

        const fetchStoryPage = async () => {
            setIsStoryListLoading(true);

            let query = supabase
                .from('stories')
                .select(
                    'id, title, cover_url, cover_wide_url, category, main_category, pen_name, synopsis, status, completion_status, created_at, writing_style, path_mode',
                    { count: 'exact' }
                )
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (activeTab !== 'all') {
                query = query.eq('main_category', activeTab);
            }

            if (debouncedSearchInput) {
                query = query.ilike('title', `%${debouncedSearchInput}%`);
            }

            const from = (currentPage - 1) * STORIES_PER_PAGE;
            const to = from + STORIES_PER_PAGE - 1;
            const { data, count, error } = await query.range(from, to);

            if (!isActive) return;

            if (error) {
                console.error('[Dashboard] Failed to fetch story list page:', error);
                setDbStories([]);
                setFilteredStoriesCount(0);
                setIsStoryListLoading(false);
                return;
            }

            setDbStories((data as DBStoryRow[] | null) || []);
            setFilteredStoriesCount(typeof count === 'number' ? count : 0);
            setIsStoryListLoading(false);
        };

        void fetchStoryPage();

        return () => {
            isActive = false;
        };
    }, [activeTab, currentPage, debouncedSearchInput, portfolioRefreshKey, userId]);

    useEffect(() => {
        if (!userId) {
            setStoryMetrics({});
            setTotalViews(0);
            setTotalLikes(0);
            setTotalFavorites(0);
            setTotalComments(0);
            setIsMetricsLoading(false);
            return;
        }

        const storyIds = storySummaryRows.map((row) => row.id);
        if (storyIds.length === 0) {
            setStoryMetrics({});
            setTotalViews(0);
            setTotalLikes(0);
            setTotalFavorites(0);
            setTotalComments(0);
            setIsMetricsLoading(false);
            return;
        }

        let isActive = true;

        const fetchMetrics = async () => {
            setIsMetricsLoading(true);

            const initialMetrics: Record<string, StoryMetrics> = Object.fromEntries(
                storyIds.map((id) => [id, { views: 0, likes: 0, comments: 0, favorites: 0 }])
            );

            const applyMetrics = (nextMetrics: Record<string, StoryMetrics>) => {
                if (!isActive) return;
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

            const { data: metricRows, error: metricError } = await supabase.rpc('get_writer_dashboard_metrics');
            if (!isActive) return;

            if (metricError) {
                if (isMissingWriterMetricsRpcError(metricError)) {
                    console.warn(
                        '[Dashboard] RPC get_writer_dashboard_metrics is unavailable. Falling back to legacy metric queries.',
                        metricError
                    );
                } else {
                    console.error(
                        '[Dashboard] RPC get_writer_dashboard_metrics failed. Falling back to legacy metric queries.',
                        metricError
                    );
                }

                const fallbackMetrics = await hydrateMetricsFromLegacyQueries();
                applyMetrics(fallbackMetrics);
                if (isActive) {
                    setIsMetricsLoading(false);
                }
                return;
            }

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
            if (isActive) {
                setIsMetricsLoading(false);
            }
        };

        void fetchMetrics();

        return () => {
            isActive = false;
        };
    }, [storySummaryRows, userId]);

    useEffect(() => {
        if (!openStoryMenu && !isProfileMenuOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (openStoryMenu && !target.closest('[data-story-actions="true"]')) {
                setOpenStoryMenu(null);
            }
            if (isProfileMenuOpen && profileMenuRef.current && !profileMenuRef.current.contains(target)) {
                setIsProfileMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [openStoryMenu, isProfileMenuOpen]);

    useEffect(() => {
        if (!openStoryMenu) return;

        const handleViewportChange = () => {
            setOpenStoryMenu(null);
        };

        window.addEventListener('resize', handleViewportChange);
        window.addEventListener('scroll', handleViewportChange, true);

        return () => {
            window.removeEventListener('resize', handleViewportChange);
            window.removeEventListener('scroll', handleViewportChange, true);
        };
    }, [openStoryMenu]);

    const portfolioStoryCount = storySummaryRows.length;

    const storyCountByMainCategory = useMemo(
        () =>
            storySummaryRows.reduce<Record<string, number>>((acc, row) => {
                if (!row.main_category) return acc;
                acc[row.main_category] = (acc[row.main_category] || 0) + 1;
                return acc;
            }, {}),
        [storySummaryRows]
    );

    const publishedStoriesCount = useMemo(
        () => storySummaryRows.filter((row) => row.status === 'published').length,
        [storySummaryRows]
    );

    const completedStoriesCount = useMemo(
        () => storySummaryRows.filter((row) => row.completion_status === 'completed').length,
        [storySummaryRows]
    );

    const pageStories: DashboardStory[] = useMemo(
        () =>
            dbStories.map((s) => {
                const metrics = storyMetrics[s.id] || { views: 0, likes: 0, comments: 0, favorites: 0 };
                return {
                    id: s.id,
                    title: s.title,
                    coverUrl:
                        s.cover_url ||
                        s.cover_wide_url ||
                        'https://images.unsplash.com/photo-1518621736915-f3b1c41bfd00?auto=format&fit=crop&w=800&q=80',
                    type: s.category === 'fanfic' ? 'fanfic' : s.category === 'cartoon' ? 'cartoon' : 'novel',
                    mainCategory: s.main_category || '',
                    penName: s.pen_name,
                    synopsis: s.synopsis,
                    status: s.status === 'published' ? 'published' : 'draft',
                    completionStatus: s.completion_status || 'ongoing',
                    createdAt: s.created_at,
                    writingStyle: parseStoryWritingStyle(s.writing_style),
                    pathMode: parseStoryPathMode(s.path_mode),
                    viewsCount: metrics.views,
                    likesCount: metrics.likes,
                    commentsCount: metrics.comments,
                    favoritesCount: metrics.favorites,
                };
            }),
        [dbStories, storyMetrics]
    );

    const totalPages = Math.max(1, Math.ceil(filteredStoriesCount / STORIES_PER_PAGE));

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const paginationStart = filteredStoriesCount === 0 ? 0 : (currentPage - 1) * STORIES_PER_PAGE + 1;
    const paginationEnd = Math.min(filteredStoriesCount, currentPage * STORIES_PER_PAGE);

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
                    updated_at: new Date().toISOString(),
                });

            if (upsertError) throw upsertError;

            setProfile({
                pen_name: editProfile.pen_name,
                bio: editProfile.bio,
                avatar_url: newAvatarUrl,
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

    const handleDashboardAccess = useCallback((event: ReactMouseEvent<HTMLAnchorElement>) => {
        if (typeof window !== 'undefined' && window.location.pathname === '/dashboard') {
            event.preventDefault();
        }
        setIsProfileMenuOpen(false);
    }, []);

    const handleOpenLogin = useCallback(() => {
        router.push('/');
    }, [router]);

    const handleSignOut = useCallback(async () => {
        try {
            setIsProfileMenuOpen(false);
            await signOut();
            router.push('/');
        } catch (error) {
            console.error('[Dashboard] Sign out failed:', error);
            alert('ออกจากระบบไม่สำเร็จ กรุณาลองใหม่');
        }
    }, [router, signOut]);

    const handleStoryStatusChange = async (storyId: string, nextStatus: StoryStatus) => {
        if (!user) return;

        const previousStatus = dbStories.find((story) => story.id === storyId)?.status;
        if (!previousStatus || previousStatus === nextStatus) return;

        setIsUpdatingStoryStatus((prev) => ({ ...prev, [storyId]: true }));
        setDbStories((prev) => prev.map((story) => (story.id === storyId ? { ...story, status: nextStatus } : story)));

        if (selectedStory?.id === storyId) {
            setSelectedStory((prev) => (prev ? { ...prev, status: nextStatus } : prev));
        }

        const { error } = await supabase
            .from('stories')
            .update({ status: nextStatus })
            .eq('id', storyId)
            .eq('user_id', user.id);

        if (error) {
            setDbStories((prev) => prev.map((story) => (story.id === storyId ? { ...story, status: previousStatus } : story)));

            if (selectedStory?.id === storyId) {
                setSelectedStory((prev) =>
                    prev ? { ...prev, status: previousStatus === 'published' ? 'published' : 'draft' } : prev
                );
            }

            alert('อัปเดตสถานะเรื่องไม่สำเร็จ กรุณาลองใหม่');
            setIsUpdatingStoryStatus((prev) => ({ ...prev, [storyId]: false }));
            return;
        }

        setStorySummaryRows((prev) => prev.map((row) => (row.id === storyId ? { ...row, status: nextStatus } : row)));
        setIsUpdatingStoryStatus((prev) => ({ ...prev, [storyId]: false }));
    };

    const handleDeleteStory = async (story: DashboardStory) => {
        if (!user) return;

        const confirmed = window.confirm(`ต้องการลบเรื่อง "${story.title}" ใช่หรือไม่?\nการลบนี้ไม่สามารถย้อนกลับได้`);
        if (!confirmed) return;

        setOpenStoryMenu(null);

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
        setStorySummaryRows((prev) => prev.filter((row) => row.id !== story.id));
        setStoryMetrics((prev) => {
            const next = { ...prev };
            delete next[story.id];
            return next;
        });

        setFilteredStoriesCount((prev) => Math.max(0, prev - 1));
        setTotalViews((prev) => Math.max(0, prev - story.viewsCount));
        setTotalLikes((prev) => Math.max(0, prev - story.likesCount));
        setTotalFavorites((prev) => Math.max(0, prev - story.favoritesCount));
        setTotalComments((prev) => Math.max(0, prev - story.commentsCount));

        if (selectedStory?.id === story.id) {
            setSelectedStory(null);
            setIsStoryInfoModalOpen(false);
        }

        setPortfolioRefreshKey((prev) => prev + 1);
    };

    const handleStoryMenuToggle = useCallback((event: ReactMouseEvent<HTMLButtonElement>, story: DashboardStory) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const viewportPadding = 12;
        const estimatedMenuHeight = 108;
        const spaceBelow = window.innerHeight - rect.bottom;
        const top = spaceBelow >= estimatedMenuHeight
            ? rect.bottom + 8
            : Math.max(viewportPadding, rect.top - estimatedMenuHeight - 8);
        const right = Math.max(viewportPadding, window.innerWidth - rect.right);

        setOpenStoryMenu((prev) => (
            prev?.story.id === story.id
                ? null
                : { story, top, right }
        ));
    }, []);

    const renderMetricValue = (value: number) => (isMetricsLoading ? '...' : formatCount(value));

    return (
        <main className={styles.main}>
            <SharedNavbar
                user={user}
                isLoadingAuth={isLoadingAuth}
                coinBalance={walletCoinBalance}
                unreadNotifCount={unreadNotifCount}
                onDashboardAccess={handleDashboardAccess}
                isProfileMenuOpen={isProfileMenuOpen}
                profileMenuRef={profileMenuRef}
                onToggleProfileMenu={() => setIsProfileMenuOpen((prev) => !prev)}
                onCloseProfileMenu={() => setIsProfileMenuOpen(false)}
                onOpenLogin={handleOpenLogin}
                onSignOut={handleSignOut}
                lovesLabel="รักเลย"
            />

            <div className={styles.pageShell}>
                <div className={`ffPageContainer ${styles.content}`}>
                    <section className={styles.overviewPanel}>
                        <div className={styles.welcomeSection}>
                            <div className={styles.welcomeCopy}>
                                <span className={styles.welcomeEyebrow}>Writer Overview</span>
                                <h1 className={styles.greeting}>สวัสดี, {profile.pen_name}</h1>
                                <p className={styles.subtitle}>{profile.bio || 'ภาพรวมผลงานและนิยายของคุณในสตูดิโอเขียนเรื่อง'}</p>
                                <div className={styles.welcomePills}>
                                    <span className={styles.welcomePill}>ผลงานทั้งหมด {formatCount(portfolioStoryCount)} เรื่อง</span>
                                    <span className={styles.welcomePill}>เผยแพร่แล้ว {formatCount(publishedStoriesCount)} เรื่อง</span>
                                    <span className={styles.welcomePill}>จบแล้ว {formatCount(completedStoriesCount)} เรื่อง</span>
                                </div>
                            </div>
                            <div className={styles.welcomeActions}>
                                <Link href="/story/create" className={styles.createBtn}>
                                    <Plus size={14} /> แต่งเรื่องใหม่
                                </Link>
                                <button onClick={handleOpenProfileModal} className={styles.profileSettingsBtn}>
                                    <Settings size={14} /> ตั้งค่าโปรไฟล์นักเขียน
                                </button>
                            </div>
                        </div>

                        <div className={styles.statsGrid}>
                            <div className={styles.statCard}>
                                <div className={`${styles.statIconWrapper} ${styles.statToneAmber}`}>
                                    <Eye size={24} />
                                </div>
                                <div className={styles.statInfo}>
                                    <p className={styles.statLabel}>ยอดวิวรวม</p>
                                    <h3 className={styles.statValue}>{renderMetricValue(totalViews)}</h3>
                                    <p className={styles.statNote}>รวมทุกเรื่องที่เผยแพร่</p>
                                </div>
                            </div>

                            <div className={styles.statCard}>
                                <div className={`${styles.statIconWrapper} ${styles.statToneRose}`}>
                                    <Heart size={24} />
                                </div>
                                <div className={styles.statInfo}>
                                    <p className={styles.statLabel}>หัวใจทั้งหมด</p>
                                    <h3 className={styles.statValue}>{renderMetricValue(totalLikes)}</h3>
                                    <p className={styles.statNote}>สัญญาณตอบรับจากผู้อ่าน</p>
                                </div>
                            </div>

                            <div className={styles.statCard}>
                                <div className={`${styles.statIconWrapper} ${styles.statToneOrange}`}>
                                    <Bookmark size={24} />
                                </div>
                                <div className={styles.statInfo}>
                                    <p className={styles.statLabel}>เก็บเข้าชั้น</p>
                                    <h3 className={styles.statValue}>{renderMetricValue(totalFavorites)}</h3>
                                    <p className={styles.statNote}>จำนวนครั้งที่ถูกเซฟไว้</p>
                                </div>
                            </div>

                            <div className={styles.statCard}>
                                <div className={`${styles.statIconWrapper} ${styles.statToneBlue}`}>
                                    <MessageSquare size={24} />
                                </div>
                                <div className={styles.statInfo}>
                                    <p className={styles.statLabel}>คอมเมนต์</p>
                                    <h3 className={styles.statValue}>{renderMetricValue(totalComments)}</h3>
                                    <p className={styles.statNote}>บทสนทนาจากผู้อ่านทั้งหมด</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <div className={styles.mainGrid}>
                        <section className={styles.card}>
                            <div className={styles.cardHeader}>
                                <div className={styles.cardHeaderCopy}>
                                    <span className={styles.cardEyebrow}>Story Library</span>
                                    <h2 className={styles.cardTitle}>นิยายของคุณ ({formatCount(portfolioStoryCount)})</h2>
                                    <p className={styles.cardSubtitle}>จัดการสถานะการเผยแพร่และเข้าไปแก้ไขแต่ละเรื่องได้จากรายการนี้</p>
                                </div>

                                <div className={styles.cardHeaderActions}>
                                    <form className={styles.storySearchForm} onSubmit={(event) => event.preventDefault()}>
                                        <Search size={15} className={styles.storySearchIcon} />
                                        <input
                                            type="search"
                                            className={styles.storySearchInput}
                                            value={searchInput}
                                            onChange={(event) => setSearchInput(event.target.value)}
                                            placeholder="ค้นหานิยายจากชื่อเรื่อง"
                                            aria-label="ค้นหานิยายจากชื่อเรื่อง"
                                        />
                                    </form>
                                    <span className={styles.searchResultMeta}>
                                        {isStoryListLoading ? 'กำลังโหลดรายการ...' : `ผลลัพธ์ ${formatCount(filteredStoriesCount)} เรื่อง`}
                                    </span>
                                </div>
                            </div>

                            <div className={styles.tabsContainer}>
                                <button
                                    className={`${styles.tabBtn} ${activeTab === 'all' ? styles.activeTab : ''}`}
                                    onClick={() => {
                                        setActiveTab('all');
                                        setCurrentPage(1);
                                    }}
                                >
                                    <span>ทั้งหมด</span>
                                    <span className={styles.tabBadge}>{formatCount(portfolioStoryCount)}</span>
                                </button>
                                {MAIN_CATEGORIES.map((category) => (
                                    <button
                                        key={category.id}
                                        className={`${styles.tabBtn} ${activeTab === category.id ? styles.activeTab : ''}`}
                                        onClick={() => {
                                            setActiveTab(category.id);
                                            setCurrentPage(1);
                                        }}
                                    >
                                        <span>{category.label}</span>
                                        <span className={styles.tabBadge}>
                                            {formatCount(storyCountByMainCategory[category.id] || 0)}
                                        </span>
                                    </button>
                                ))}
                            </div>

                            <div className={styles.storyList}>
                                {isStoryListLoading ? (
                                    <div className={styles.listLoading}>กำลังโหลดรายการนิยาย...</div>
                                ) : pageStories.length === 0 ? (
                                    <div className={styles.emptyStories}>
                                        <p>
                                            {debouncedSearchInput
                                                ? 'ไม่พบนิยายที่ตรงกับคำค้นหา'
                                                : 'ยังไม่มีนิยายในหมวดนี้'}
                                        </p>
                                        <Link href="/story/create" className={styles.emptyStoriesLink}>+ สร้างเรื่องใหม่</Link>
                                    </div>
                                ) : (
                                    pageStories.map((story) => {
                                        const createdDate = story.createdAt
                                            ? new Date(story.createdAt).toLocaleDateString('th-TH', {
                                                day: 'numeric',
                                                month: 'short',
                                            })
                                            : 'ไม่ทราบ';
                                        const storyModeBadges = getStoryModeBadges(story);

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
                                                            {storyModeBadges.map((badge) => (
                                                                <span key={`${story.id}-${badge.key}`} className={badge.className}>
                                                                    {badge.label}
                                                                </span>
                                                            ))}
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
                                                                aria-expanded={openStoryMenu?.story.id === story.id}
                                                                onClick={(event) => {
                                                                    handleStoryMenuToggle(event, story);
                                                                }}
                                                            >
                                                                <MoreVertical size={18} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {filteredStoriesCount > 0 && (
                                <div className={styles.paginationBar}>
                                    <span className={styles.paginationInfo}>
                                        แสดง {formatCount(paginationStart)}-{formatCount(paginationEnd)} จาก {formatCount(filteredStoriesCount)} เรื่อง
                                    </span>
                                    <div className={styles.paginationActions}>
                                        <button
                                            type="button"
                                            className={styles.paginationBtn}
                                            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                                            disabled={currentPage <= 1 || isStoryListLoading}
                                        >
                                            ก่อนหน้า
                                        </button>
                                        <span className={styles.paginationPage}>หน้า {formatCount(currentPage)} / {formatCount(totalPages)}</span>
                                        <button
                                            type="button"
                                            className={styles.paginationBtn}
                                            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                                            disabled={currentPage >= totalPages || isStoryListLoading}
                                        >
                                            ถัดไป
                                        </button>
                                    </div>
                                </div>
                            )}
                        </section>
                    </div>
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
                                        {getStoryModeBadges(selectedStory).map((badge) => (
                                            <span key={`selected-${badge.key}`} className={badge.className}>
                                                {badge.label}
                                            </span>
                                        ))}
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
                                            {selectedStory.createdAt
                                                ? new Date(selectedStory.createdAt).toLocaleDateString('th-TH', {
                                                    year: 'numeric',
                                                    month: 'long',
                                                    day: 'numeric',
                                                })
                                                : '-'}
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

            {openStoryMenu && typeof document !== 'undefined' && createPortal(
                <div
                    className={`${styles.storyActionMenu} ${styles.storyActionMenuFloating}`}
                    data-story-actions="true"
                    style={{ top: openStoryMenu.top, right: openStoryMenu.right }}
                >
                    <button
                        type="button"
                        className={styles.storyActionMenuItem}
                        onClick={() => {
                            setSelectedStory(openStoryMenu.story);
                            setIsStoryInfoModalOpen(true);
                            setOpenStoryMenu(null);
                        }}
                    >
                        ดูรายละเอียด
                    </button>
                    <button
                        type="button"
                        className={`${styles.storyActionMenuItem} ${styles.storyActionMenuItemDanger}`}
                        onClick={() => handleDeleteStory(openStoryMenu.story)}
                    >
                        ลบ
                    </button>
                </div>,
                document.body
            )}
        </main>
    );
}
