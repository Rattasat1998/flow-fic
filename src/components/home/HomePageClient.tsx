'use client';

import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Heart, Settings, List, Eye } from 'lucide-react';
import styles from '@/app/home.module.css';
import { supabase } from '@/lib/supabase';
import {
  MAIN_CATEGORIES,
  SUB_CATEGORIES,
  getMainCategoryLabel,
  getSubCategoryLabel,
} from '@/lib/categories';
import { useAuth } from '@/contexts/AuthContext';
import { useHomeGsapAnimations } from '@/components/home/useHomeGsapAnimations';
import { useHomeHeroAnimations } from '@/components/home/useHomeHeroAnimations';
import { HeroSection } from '@/components/home/sections/HeroSection';
import { TrendingSection } from '@/components/home/sections/TrendingSection';
import { CategoryShelvesSection } from '@/components/home/sections/CategoryShelvesSection';
import { EditorPicksSection } from '@/components/home/sections/EditorPicksSection';
import { WriterCtaSection } from '@/components/home/sections/WriterCtaSection';
import { SharedNavbar } from '@/components/navigation/SharedNavbar';
import navbarStyles from '@/components/navigation/SharedNavbar.module.css';
import { StorySearchPanel } from '@/components/navigation/StorySearchPanel';
import { StoryMediumCard } from '@/components/story/StoryMediumCard';
import type {
  DiscoveryFilters,
  DiscoveryRailKey,
  DiscoveryResponse,
  DiscoveryStory,
} from '@/types/discovery';

const ProfileSettingsModal = dynamic(
  () => import('@/components/home/sections/ProfileSettingsModal').then((module) => module.ProfileSettingsModal)
);
const AuthGuardDialog = dynamic(
  () => import('@/components/home/sections/AuthGuardDialog').then((module) => module.AuthGuardDialog)
);

const DISCOVERY_LIMIT = 12;
const DISCOVERY_CACHE_PREFIX = 'ff_home_discovery::';
const DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000;
const HERO_ROTATION_MS = 7000;
const HERO_STORY_LIMIT = 5;

type HomeRailState = {
  items: DiscoveryStory[];
  error: string | null;
  loading: boolean;
};

type HomeRailsState = Record<DiscoveryRailKey, HomeRailState>;

type UserProfile = {
  pen_name: string;
  bio: string;
  avatar_url: string | null;
};

type DiscoveryCacheEntry = {
  timestamp: number;
  payload: DiscoveryResponse;
};

function createInitialRails(loading: boolean): HomeRailsState {
  return {
    new: { items: [], error: null, loading },
    popular: { items: [], error: null, loading },
    trending: { items: [], error: null, loading },
  };
}

function buildApiQueryFromFilters(filters: DiscoveryFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.category !== 'all') params.set('category', filters.category);
  if (filters.subCategory !== 'all') params.set('subCategory', filters.subCategory);
  if (filters.completion !== 'all') params.set('completion', filters.completion);
  if (filters.length !== 'all') params.set('length', filters.length);
  if (filters.offset > 0) params.set('offset', String(filters.offset));
  params.set('focusCore', filters.focusCore ? 'true' : 'false');
  params.set('limit', String(filters.limit));
  return params.toString();
}

function compareStoriesByShelfPriority(a: DiscoveryStory, b: DiscoveryStory): number {
  if (b.score_7d !== a.score_7d) return b.score_7d - a.score_7d;
  if (b.total_view_count !== a.total_view_count) return b.total_view_count - a.total_view_count;

  const createdAtA = a.created_at ? Date.parse(a.created_at) : 0;
  const createdAtB = b.created_at ? Date.parse(b.created_at) : 0;
  const safeCreatedAtA = Number.isNaN(createdAtA) ? 0 : createdAtA;
  const safeCreatedAtB = Number.isNaN(createdAtB) ? 0 : createdAtB;
  return safeCreatedAtB - safeCreatedAtA;
}

function railsFromPayload(payload: DiscoveryResponse, loading: boolean): HomeRailsState {
  return {
    new: {
      items: payload.rails.new.items,
      error: payload.rails.new.error,
      loading,
    },
    popular: {
      items: payload.rails.popular.items,
      error: payload.rails.popular.error,
      loading,
    },
    trending: {
      items: payload.rails.trending.items,
      error: payload.rails.trending.error,
      loading,
    },
  };
}

type HomePageClientProps = {
  initialDiscovery: DiscoveryResponse;
};

export default function HomePageClient({ initialDiscovery }: HomePageClientProps) {
  const searchParams = useSearchParams();
  const { user, isLoading: isLoadingAuth, signInWithFacebook, signInWithGoogle, signOut } = useAuth();
  const userId = user?.id ?? null;

  const [authError, setAuthError] = useState<string | null>(null);
  const [isDashboardAuthDialogOpen, setIsDashboardAuthDialogOpen] = useState(false);
  const [dashboardAuthDialogTitle, setDashboardAuthDialogTitle] = useState('เข้าสู่ระบบก่อนเข้าแดชบอร์ดนักเขียน');
  const [dashboardAuthDialogMessage, setDashboardAuthDialogMessage] = useState<string | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [walletCoinBalance, setWalletCoinBalance] = useState<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const homeRootRef = useRef<HTMLElement | null>(null);
  const navbarRef = useRef<HTMLElement | null>(null);
  const heroSectionRef = useRef<HTMLElement | null>(null);
  const trendingSectionRef = useRef<HTMLElement | null>(null);
  const mainCategoryMapSectionRef = useRef<HTMLElement | null>(null);
  const editorSectionRef = useRef<HTMLElement | null>(null);
  const writerCtaSectionRef = useRef<HTMLElement | null>(null);
  const subCategoryRailRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Profile Settings State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile>({ pen_name: 'Flow Writer', bio: '', avatar_url: null });
  const [editProfile, setEditProfile] = useState<UserProfile>({ pen_name: '', bio: '', avatar_url: null });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewMode = (searchParams.get('view') || '').trim().toLowerCase();
  const selectedGridCategoryId = (searchParams.get('category') || '').trim();
  const selectedLegacyGridShelfId = (searchParams.get('shelf') || '').trim();
  const searchSeedFromQuery = (searchParams.get('q') || '').trim().slice(0, 120);
  const initialApiQuery = useMemo(
    () =>
      buildApiQueryFromFilters({
        q: '',
        category: 'all',
        subCategory: 'all',
        completion: 'all',
        length: 'all',
        focusCore: false,
        limit: DISCOVERY_LIMIT,
        offset: 0,
      }),
    []
  );
  const serverPrefetchQueryRef = useRef<string | null>(initialApiQuery);

  const [searchInput, setSearchInput] = useState(searchSeedFromQuery);
  const [rails, setRails] = useState<HomeRailsState>(() => railsFromPayload(initialDiscovery, false));
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    document.body.classList.add('home-dark-premium-body');
    return () => {
      document.body.classList.remove('home-dark-premium-body');
    };
  }, []);

  useEffect(() => {
    setSearchInput(searchSeedFromQuery);
  }, [searchSeedFromQuery]);

  const apiQuery = initialApiQuery;

  const cacheKey = useMemo(() => `${DISCOVERY_CACHE_PREFIX}${apiQuery || 'default'}`, [apiQuery]);

  useEffect(() => {
    let isCancelled = false;
    const controller = new AbortController();
    let hasFreshCache = false;

    const applyPayload = (payload: DiscoveryResponse) => {
      if (isCancelled) return;
      setRails({
        new: {
          items: payload.rails.new.items,
          error: payload.rails.new.error,
          loading: false,
        },
        popular: {
          items: payload.rails.popular.items,
          error: payload.rails.popular.error,
          loading: false,
        },
        trending: {
          items: payload.rails.trending.items,
          error: payload.rails.trending.error,
          loading: false,
        },
      });
    };

    const loadDiscovery = async () => {
      if (serverPrefetchQueryRef.current === apiQuery) {
        hasFreshCache = true;
        applyPayload(initialDiscovery);
        serverPrefetchQueryRef.current = null;

        if (typeof window !== 'undefined') {
          const initialEntry: DiscoveryCacheEntry = {
            timestamp: Date.now(),
            payload: initialDiscovery,
          };
          sessionStorage.setItem(cacheKey, JSON.stringify(initialEntry));
        }
      }

      if (typeof window !== 'undefined') {
        const rawCache = sessionStorage.getItem(cacheKey);
        if (rawCache) {
          try {
            const parsed = JSON.parse(rawCache) as DiscoveryCacheEntry;
            if (
              parsed &&
              typeof parsed.timestamp === 'number' &&
              parsed.payload &&
              Date.now() - parsed.timestamp < DISCOVERY_CACHE_TTL_MS
            ) {
              hasFreshCache = true;
              applyPayload(parsed.payload);
            }
          } catch {
            sessionStorage.removeItem(cacheKey);
          }
        }
      }

      if (!hasFreshCache) {
        setRails(createInitialRails(true));
      }

      try {
        const response = await fetch(`/api/discovery${apiQuery ? `?${apiQuery}` : ''}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`DISCOVERY_HTTP_${response.status}`);
        }

        const payload = (await response.json()) as DiscoveryResponse;
        applyPayload(payload);

        if (typeof window !== 'undefined') {
          const entry: DiscoveryCacheEntry = {
            timestamp: Date.now(),
            payload,
          };
          sessionStorage.setItem(cacheKey, JSON.stringify(entry));
        }
      } catch (error) {
        if (isCancelled || controller.signal.aborted) return;

        if (hasFreshCache) {
          return;
        }

        const message = error instanceof Error ? error.message : 'ไม่สามารถโหลดข้อมูล Discovery ได้';
        setRails({
          new: { items: [], error: message, loading: false },
          popular: { items: [], error: message, loading: false },
          trending: { items: [], error: message, loading: false },
        });
      }
    };

    loadDiscovery();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [apiQuery, cacheKey, initialDiscovery]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!userId) return;
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (data) {
        setProfile(data as UserProfile);
      }
    };
    fetchProfile();
  }, [userId]);

  useEffect(() => {
    if (!user) return;
    setIsDashboardAuthDialogOpen(false);
    setDashboardAuthDialogMessage(null);
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

        const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, avatarFile);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(fileName);

        newAvatarUrl = publicUrlData.publicUrl;
      }

      const { error: upsertError } = await supabase.from('profiles').upsert({
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

  // Fetch unread notification count
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
    fetchUnread();
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

    fetchWalletBalance();
  }, [userId]);

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };

    window.addEventListener('keydown', handleSearchShortcut);
    return () => window.removeEventListener('keydown', handleSearchShortcut);
  }, []);

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

  const handleCloseDashboardAuthDialog = () => {
    setIsDashboardAuthDialogOpen(false);
    setDashboardAuthDialogTitle('เข้าสู่ระบบก่อนเข้าแดชบอร์ดนักเขียน');
    setDashboardAuthDialogMessage(null);
    setAuthError(null);
  };

  const handleDashboardAccess = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (isLoadingAuth) {
      event.preventDefault();
      setAuthError(null);
      setDashboardAuthDialogTitle('กำลังตรวจสอบสถานะการเข้าสู่ระบบ');
      setDashboardAuthDialogMessage('กำลังตรวจสอบสถานะการเข้าสู่ระบบ กรุณาลองอีกครั้ง');
      setIsDashboardAuthDialogOpen(true);
      return;
    }

    if (user) {
      setAuthError(null);
      setIsDashboardAuthDialogOpen(false);
      setDashboardAuthDialogMessage(null);
      setIsProfileMenuOpen(false);
      return;
    }

    event.preventDefault();
    setAuthError(null);
    setDashboardAuthDialogTitle('เข้าสู่ระบบก่อนเข้าแดชบอร์ดนักเขียน');
    setDashboardAuthDialogMessage('เข้าสู่ระบบเพื่อดูสถิติ จัดการเรื่อง และตั้งค่าการเผยแพร่ในแดชบอร์ดนักเขียน');
    setIsDashboardAuthDialogOpen(true);
    setIsProfileMenuOpen(false);
  };

  const handleOpenLoginDialog = () => {
    setAuthError(null);
    setDashboardAuthDialogTitle('เข้าสู่ระบบ FlowFic');
    setDashboardAuthDialogMessage('เข้าสู่ระบบเพื่อบันทึกชั้นหนังสือ กดหัวใจ และปลดล็อกฟีเจอร์นักเขียน');
    setIsDashboardAuthDialogOpen(true);
    setIsProfileMenuOpen(false);
  };

  const heroStories = useMemo(() => {
    const candidates = [...rails.trending.items, ...rails.popular.items, ...rails.new.items];
    const uniqueStories = new Map<string, DiscoveryStory>();

    for (const story of candidates) {
      if (!uniqueStories.has(story.id)) uniqueStories.set(story.id, story);
    }

    return Array.from(uniqueStories.values()).slice(0, HERO_STORY_LIMIT);
  }, [rails]);

  const heroStory = heroStories[heroIndex] ?? null;

  useEffect(() => {
    if (heroStories.length === 0) {
      setHeroIndex(0);
      return;
    }

    if (heroIndex > heroStories.length - 1) {
      setHeroIndex(0);
    }
  }, [heroStories.length, heroIndex]);

  useEffect(() => {
    if (heroStories.length <= 1) return;

    const intervalId = window.setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroStories.length);
    }, HERO_ROTATION_MS);

    return () => window.clearInterval(intervalId);
  }, [heroStories.length]);

  const heroInfoPills = useMemo(() => {
    if (!heroStory) return [];

    const typeLabel = heroStory.category === 'fanfic' ? 'แฟนฟิค' : 'ออริจินัล';
    const mainCategoryLabel = getMainCategoryLabel(heroStory.main_category);
    const subCategoryLabel = getSubCategoryLabel(heroStory.sub_category);

    return [typeLabel, mainCategoryLabel, subCategoryLabel].filter(Boolean).slice(0, 2) as string[];
  }, [heroStory]);
  const searchQuery = searchInput.trim();
  const normalizedSearch = searchQuery.toLowerCase();
  const hasSearch = normalizedSearch.length > 0;

  const matchesSearch = useCallback(
    (story: DiscoveryStory) => {
      if (!hasSearch) return true;

      const mainCategoryLabel = getMainCategoryLabel(story.main_category).toLowerCase();
      const subCategoryLabel = getSubCategoryLabel(story.sub_category).toLowerCase();
      const haystack = [
        story.title,
        story.pen_name,
        story.synopsis || '',
        mainCategoryLabel,
        subCategoryLabel,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    },
    [hasSearch, normalizedSearch]
  );

  const trendingStories = useMemo(
    () => rails.trending.items.filter(matchesSearch),
    [matchesSearch, rails.trending.items]
  );
  const trendingLoading = rails.trending.loading;
  const trendingError = rails.trending.error;

  const unifiedStories = useMemo(() => {
    const uniqueStories = new Map<string, DiscoveryStory>();
    [...rails.trending.items, ...rails.popular.items, ...rails.new.items].forEach((story) => {
      if (!uniqueStories.has(story.id)) uniqueStories.set(story.id, story);
    });
    return Array.from(uniqueStories.values());
  }, [rails]);

  const searchableStories = useMemo(
    () => unifiedStories.filter(matchesSearch),
    [matchesSearch, unifiedStories]
  );

  const recommendedSearchStories = useMemo(
    () => [...unifiedStories].sort(compareStoriesByShelfPriority).slice(0, 8),
    [unifiedStories]
  );

  const searchPanelStories = useMemo(
    () => (hasSearch ? searchableStories.slice(0, 8) : recommendedSearchStories),
    [hasSearch, searchableStories, recommendedSearchStories]
  );

  const isSearchPanelLoading = !hasSearch
    && searchPanelStories.length === 0
    && (rails.new.loading || rails.popular.loading || rails.trending.loading);

  const searchPanelContent = useMemo(
    () => (
      <StorySearchPanel
        stories={searchPanelStories}
        query={searchQuery}
        isLoading={isSearchPanelLoading}
      />
    ),
    [isSearchPanelLoading, searchPanelStories, searchQuery]
  );

  const subCategoryToMainCategoryMap = useMemo(
    () => new Map(SUB_CATEGORIES.map((subCategory) => [subCategory.id, subCategory.mainCategoryId])),
    []
  );

  const filteredPopularStories = useMemo(
    () => rails.popular.items.filter(matchesSearch),
    [matchesSearch, rails.popular.items]
  );

  const filteredNewStories = useMemo(
    () => rails.new.items.filter(matchesSearch),
    [matchesSearch, rails.new.items]
  );

  const editorFeaturedStory = useMemo(
    () => filteredPopularStories[0] ?? filteredNewStories[0] ?? trendingStories[0] ?? null,
    [filteredNewStories, filteredPopularStories, trendingStories]
  );

  const editorSideStories = useMemo(() => {
    const uniqueStories = new Map<string, DiscoveryStory>();
    [...filteredNewStories, ...filteredPopularStories, ...trendingStories].forEach((story) => {
      if (editorFeaturedStory && story.id === editorFeaturedStory.id) return;
      if (!uniqueStories.has(story.id)) uniqueStories.set(story.id, story);
    });
    return Array.from(uniqueStories.values()).slice(0, 2);
  }, [editorFeaturedStory, filteredNewStories, filteredPopularStories, trendingStories]);

  const mainCategoryShelves = useMemo(() => {
    const storiesByMainCategory = new Map<string, Map<string, DiscoveryStory>>();

    for (const story of searchableStories) {
      const resolvedMainCategoryId =
        story.main_category ||
        (story.sub_category ? subCategoryToMainCategoryMap.get(story.sub_category) ?? null : null);

      if (!resolvedMainCategoryId) continue;

      if (!storiesByMainCategory.has(resolvedMainCategoryId)) {
        storiesByMainCategory.set(resolvedMainCategoryId, new Map<string, DiscoveryStory>());
      }

      storiesByMainCategory.get(resolvedMainCategoryId)?.set(story.id, story);
    }

    return MAIN_CATEGORIES.map((mainCategory) => {
      const stories = Array.from(storiesByMainCategory.get(mainCategory.id)?.values() ?? []).sort(
        compareStoriesByShelfPriority
      );

      return {
        id: mainCategory.id,
        label: mainCategory.label,
        stories,
      };
    }).filter((categoryShelf) => categoryShelf.stories.length > 0);
  }, [searchableStories, subCategoryToMainCategoryMap]);

  const setMainCategoryRailRef = useCallback((mainCategoryId: string, node: HTMLDivElement | null) => {
    subCategoryRailRefs.current[mainCategoryId] = node;
  }, []);

  const handleScrollMainCategoryRail = useCallback((mainCategoryId: string) => {
    const rail = subCategoryRailRefs.current[mainCategoryId];
    if (!rail) return;
    const scrollDelta = Math.max(rail.clientWidth * 0.8, 280);
    rail.scrollBy({ left: scrollDelta, behavior: 'smooth' });
  }, []);

  const resolvedGridCategoryId = useMemo(() => {
    if (selectedGridCategoryId) return selectedGridCategoryId;
    if (!selectedLegacyGridShelfId) return '';
    return subCategoryToMainCategoryMap.get(selectedLegacyGridShelfId) ?? '';
  }, [selectedGridCategoryId, selectedLegacyGridShelfId, subCategoryToMainCategoryMap]);

  const selectedGridCategory = useMemo(() => {
    if (viewMode !== 'grid' || !resolvedGridCategoryId) return null;

    const categoryMeta = MAIN_CATEGORIES.find((category) => category.id === resolvedGridCategoryId);
    if (!categoryMeta) return null;

    const categoryShelf = mainCategoryShelves.find((shelf) => shelf.id === resolvedGridCategoryId);
    return {
      id: categoryMeta.id,
      label: categoryMeta.label,
      stories: categoryShelf?.stories ?? [],
    };
  }, [mainCategoryShelves, resolvedGridCategoryId, viewMode]);

  const isGridMode = viewMode === 'grid';
  const renderHomeMediumCard = (story: DiscoveryStory, className: string, dataCard: string, imageSizes: string) => {
    const isInteractiveStory = story.path_mode === 'branching';

    return (
      <StoryMediumCard
        key={`${dataCard}-${story.id}`}
        href={`/story/${story.id}`}
        coverUrl={story.cover_url || story.cover_wide_url}
        title={story.title}
        author={story.pen_name}
        className={className}
        dataCard={dataCard}
        enableTilt
        imageSizes={imageSizes}
        footer={(
          <div className={styles.mainCategoryShelfMetaRow}>
            {story.writing_style === 'visual_novel' ? (
              <span className={`${styles.posterModeChip} ${styles.posterVisualNovelChip}`}>Visual Novel</span>
            ) : isInteractiveStory ? (
              <span className={styles.posterModeChip}>Interactive</span>
            ) : (
              <span className={styles.posterMetric}>
                <List size={12} className={styles.posterMetricIcon} />
                {story.published_chapter_count.toLocaleString('th-TH')} ตอน
              </span>
            )}
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
    );
  };

  useHomeGsapAnimations({
    rootRef: homeRootRef,
    navbarRef,
    heroRef: heroSectionRef,
    trendingRef: trendingSectionRef,
    mainCategoryMapRef: mainCategoryMapSectionRef,
    editorRef: editorSectionRef,
    writerCtaRef: writerCtaSectionRef,
    isGridMode,
  });

  useHomeHeroAnimations({ heroSectionRef: heroSectionRef, heroIndex });

  return (
    <main className={styles.main} ref={homeRootRef}>
      <SharedNavbar
        navRef={navbarRef}
        navDataGsap="navbar"
        user={user}
        isLoadingAuth={isLoadingAuth}
        coinBalance={walletCoinBalance}
        unreadNotifCount={unreadNotifCount}
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onSearchSubmit={(event) => event.preventDefault()}
        searchPanel={searchPanelContent}
        searchInputRef={searchInputRef}
        onDashboardAccess={handleDashboardAccess}
        isProfileMenuOpen={isProfileMenuOpen}
        profileMenuRef={profileMenuRef}
        onToggleProfileMenu={() => setIsProfileMenuOpen((prev) => !prev)}
        onCloseProfileMenu={() => setIsProfileMenuOpen(false)}
        onOpenLogin={handleOpenLoginDialog}
        onSignOut={handleSignOut}
        lovesLabel="รักเลย"
        profileExtraAction={(
          <button
            type="button"
            className={navbarStyles.profileDropdownItem}
            onClick={() => {
              setIsProfileMenuOpen(false);
              handleOpenProfileModal();
            }}
          >
            <Settings size={16} /> ตั้งค่าโปรไฟล์
          </button>
        )}
      />

      <div className={styles.pageShell}>
        <div className={styles.content}>
          {authError && !isDashboardAuthDialogOpen && (
            <div className={styles.emptyMyNovels} style={{ color: '#ff9d9d' }}>
              {authError}
            </div>
          )}

          <HeroSection
            sectionRef={heroSectionRef}
            stories={heroStories}
            heroStory={heroStory}
            heroInfoPills={heroInfoPills}
            heroIndex={heroIndex}
            onDotClick={setHeroIndex}
          />

          <TrendingSection
            sectionRef={trendingSectionRef}
            stories={trendingStories}
            loading={trendingLoading}
            error={trendingError}
          />

          <CategoryShelvesSection
            sectionRef={mainCategoryMapSectionRef}
            shelves={mainCategoryShelves}
            isGridMode={isGridMode}
            selectedCategory={selectedGridCategory}
            onSetMainCategoryRailRef={setMainCategoryRailRef}
            onScrollMainCategoryRail={handleScrollMainCategoryRail}
            renderHomeMediumCard={renderHomeMediumCard}
          />

          <EditorPicksSection
            sectionRef={editorSectionRef}
            featuredStory={editorFeaturedStory}
            sideStories={editorSideStories}
          />

          <WriterCtaSection sectionRef={writerCtaSectionRef} user={user} onOpenLogin={handleOpenLoginDialog} />
        </div>

      </div>

      <ProfileSettingsModal
        isOpen={isProfileModalOpen}
        userId={user?.id ?? null}
        profile={editProfile}
        avatarPreviewUrl={avatarPreviewUrl}
        isSaving={isSavingProfile}
        fileInputRef={fileInputRef}
        onClose={() => setIsProfileModalOpen(false)}
        onAvatarChange={handleAvatarChange}
        onOpenFilePicker={() => fileInputRef.current?.click()}
        onPenNameChange={(value) => setEditProfile((prev) => ({ ...prev, pen_name: value }))}
        onBioChange={(value) => setEditProfile((prev) => ({ ...prev, bio: value }))}
        onSave={handleSaveProfile}
      />

      <AuthGuardDialog
        isOpen={isDashboardAuthDialogOpen}
        title={dashboardAuthDialogTitle}
        message={dashboardAuthDialogMessage}
        authError={authError}
        isLoadingAuth={isLoadingAuth}
        isLoggedIn={Boolean(user)}
        onClose={handleCloseDashboardAuthDialog}
        onGoogleSignIn={handleGoogleSignIn}
        onFacebookSignIn={handleFacebookSignIn}
      />
    </main>
  );
}
