'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PenTool,
  Heart,
  Settings,
  Upload,
  X,
  ArrowRight,
  ChevronRight,
  Star,
  AlertCircle,
  Inbox,
  List,
  Eye,
} from 'lucide-react';
import styles from '@/app/home.module.css';
import { supabase } from '@/lib/supabase';
import {
  MAIN_CATEGORIES,
  SUB_CATEGORIES,
  getMainCategoryLabel,
  getSubCategoryLabel,
} from '@/lib/categories';
import { useAuth } from '@/contexts/AuthContext';
import { WalletLedgerPanel } from '@/components/profile/WalletLedgerPanel';
import { useHomeGsapAnimations } from '@/components/home/useHomeGsapAnimations';
import { SharedNavbar } from '@/components/navigation/SharedNavbar';
import type {
  DiscoveryFilters,
  DiscoveryRailKey,
  DiscoveryResponse,
  DiscoveryStory,
} from '@/types/discovery';

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
  const normalizedSearch = searchInput.trim().toLowerCase();
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
            className={styles.profileDropdownItem}
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

          <section className={styles.heroSection} ref={heroSectionRef} data-gsap-section="hero">
            {heroStory ? (
              <div className={styles.heroFrame} data-gsap="hero-frame">
                {heroStory.cover_wide_url || heroStory.cover_url ? (
                  <Image
                    src={heroStory.cover_wide_url || heroStory.cover_url || ''}
                    alt={heroStory.title}
                    className={styles.heroBackdrop}
                    fill
                    priority={heroIndex === 0}
                    sizes="100vw"
                  />
                ) : (
                  <div className={styles.heroBackdropFallback}>เรื่องเด่นประจำวัน</div>
                )}

                <div className={styles.heroOverlay} />

                <div className={styles.heroContent}>
                  <span className={styles.heroBadge} data-gsap-intro>เรื่องเด่นวันนี้</span>
                  <h1 className={styles.heroStoryTitle} data-gsap-intro>{heroStory.title}</h1>
                  <p className={styles.heroStoryPen} data-gsap-intro>โดย {heroStory.pen_name}</p>
                  {heroStory.synopsis && <p className={styles.heroStorySynopsis} data-gsap-intro>{heroStory.synopsis}</p>}
                  {heroInfoPills.length > 0 && (
                    <div className={styles.heroInfoPills} data-gsap-intro>
                      {heroInfoPills.map((pill, index) => (
                        <span key={`${pill}-${index}`} className={styles.heroInfoPill}>
                          {pill}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className={styles.heroActionRow} data-gsap-intro>
                    <Link href={`/story/${heroStory.id}`} className={styles.heroCtaButton}>
                      เริ่มอ่านเรื่องนี้
                      <ArrowRight size={16} />
                    </Link>
                    <div className={styles.heroAuthorMeta}>
                      <span>ผู้เขียน</span>
                      <strong>{heroStory.pen_name}</strong>
                    </div>
                  </div>
                </div>

                {heroStories.length > 1 && (
                  <div className={styles.heroDots}>
                    {heroStories.map((story, index) => (
                      <button
                        key={story.id}
                        type="button"
                        aria-label={`ดูเรื่องเด่นลำดับที่ ${index + 1}`}
                        className={`${styles.heroDot} ${index === heroIndex ? styles.activeHeroDot : ''}`}
                        onClick={() => setHeroIndex(index)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.heroEmpty}>กำลังโหลดเรื่องแนะนำ...</div>
            )}
          </section>

          <section className={styles.trendingSection} ref={trendingSectionRef} data-gsap-section="trending">
            <div className={styles.sectionHeader}>
              <div className={styles.sectionHeaderLeft}>
                <h2 className={styles.sectionHeadline}>กำลังมาแรง</h2>
                <p className={styles.sectionSubhead}>เรื่องที่ผู้อ่านกำลังพูดถึงและเปิดอ่านมากที่สุดในตอนนี้</p>
              </div>
              <Link href="/" className={styles.sectionActionLink}>
                ดูอันดับทั้งหมด
                <ArrowRight size={16} />
              </Link>
            </div>

            {trendingLoading ? (
              <div className={styles.trendingGrid}>
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={`trending-skeleton-${index}`} className={styles.storySkeleton} />
                ))}
              </div>
            ) : trendingError ? (
              <div className={`${styles.railStateCard} ${styles.railStateError}`}>
                <AlertCircle size={18} />
                <div>
                  <p className={styles.railStateTitle}>โหลดข้อมูลไม่สำเร็จ</p>
                  <p className={styles.railStateText}>{trendingError}</p>
                </div>
              </div>
            ) : trendingStories.length === 0 ? (
              <div className={styles.railStateCard}>
                <Inbox size={18} />
                <div>
                  <p className={styles.railStateTitle}>ยังไม่มีข้อมูล</p>
                  <p className={styles.railStateText}>ยังไม่มีเรื่องกำลังมาแรงที่ตรงกับคำค้นปัจจุบัน</p>
                </div>
              </div>
            ) : (
              <div className={styles.trendingGrid}>
                {trendingStories.slice(0, 8).map((story, index) => {
                  const isInteractiveStory = story.path_mode === 'branching';
                  const likes = story.total_like_count ?? 0;
                  const views = Math.max(1, story.total_view_count ?? 0);
                  const score = Math.min(5, 4 + (likes / views) * 12).toFixed(1);

                  return (
                    <Link key={`trending-${story.id}`} href={`/story/${story.id}`} className={styles.trendingCard} data-gsap-card="trending">
                      <div className={styles.trendingCoverWrap}>
                        {story.cover_url || story.cover_wide_url ? (
                          <Image
                            src={story.cover_url || story.cover_wide_url || ''}
                            alt={story.title}
                            className={styles.trendingCover}
                            fill
                            sizes="(max-width: 767px) 47vw, (max-width: 1180px) 31vw, 320px"
                          />
                        ) : (
                          <div className={styles.trendingCoverFallback}>{story.title.slice(0, 2)}</div>
                        )}

                        {index < 4 && <span className={styles.trendingRankBadge}>#{index + 1}</span>}
                      </div>

                      <div className={styles.trendingBody}>
                        <h3 className={styles.trendingTitle}>{story.title}</h3>
                        <p className={styles.trendingAuthor}>{story.pen_name}</p>
                        <div className={styles.trendingStats}>
                          <span className={styles.trendingScore}>
                            <Star size={12} />
                            {score}
                          </span>
                          <span className={styles.trendingReads}>{(story.total_view_count ?? 0).toLocaleString('th-TH')} อ่าน</span>
                        </div>
                        <div className={styles.trendingMetaRow}>
                          {isInteractiveStory ? (
                            <span className={styles.posterModeChip}>Interactive</span>
                          ) : (
                            <span className={styles.posterMetric}>
                              <List size={12} className={styles.posterMetricIcon} />
                              {story.published_chapter_count.toLocaleString('th-TH')} ตอน
                            </span>
                          )}
                          <span className={styles.posterMetric}>
                            <Heart size={12} className={styles.posterMetricIcon} />
                            {(story.total_like_count ?? 0).toLocaleString('th-TH')}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section className={styles.mainCategoryMapSection} ref={mainCategoryMapSectionRef} data-gsap-section="main-category-map">
            {isGridMode ? (
              selectedGridCategory ? (
                <div className={styles.shelfGridModeSection} data-gsap-grid-mode>
                  <div className={styles.shelfGridModeHeader}>
                    <h3 className={styles.shelfGridModeTitle}>{selectedGridCategory.label}</h3>
                  </div>
                  {selectedGridCategory.stories.length === 0 ? (
                    <div className={styles.railStateCard}>
                      <Inbox size={18} />
                      <div>
                        <p className={styles.railStateTitle}>ยังไม่มีเรื่องในหมวดนี้</p>
                        <p className={styles.railStateText}>หมวดที่เลือกยังไม่มีเรื่องที่ตรงกับคำค้นปัจจุบัน</p>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.shelfGrid}>
                      {selectedGridCategory.stories.map((story) => {
                        const isInteractiveStory = story.path_mode === 'branching';
                        return (
                          <Link
                            key={`grid-${selectedGridCategory.id}-${story.id}`}
                            href={`/story/${story.id}`}
                            className={`${styles.mainCategoryShelfCard} ${styles.shelfGridCard}`}
                            data-gsap-card="grid-category"
                          >
                            <div className={styles.mainCategoryShelfCoverWrap}>
                              {story.cover_url || story.cover_wide_url ? (
                                <Image
                                  src={story.cover_url || story.cover_wide_url || ''}
                                  alt={story.title}
                                  className={styles.mainCategoryShelfCover}
                                  fill
                                  sizes="(max-width: 767px) 46vw, (max-width: 1180px) 23vw, 16vw"
                                />
                              ) : (
                                <div className={styles.mainCategoryShelfCoverFallback}>{story.title.slice(0, 2)}</div>
                              )}
                            </div>

                            <div className={styles.mainCategoryShelfBody}>
                              <h4 className={styles.mainCategoryShelfTitle}>{story.title}</h4>
                              <p className={styles.mainCategoryShelfAuthor}>{story.pen_name}</p>
                              <div className={styles.mainCategoryShelfMetaRow}>
                                {isInteractiveStory ? (
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
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className={styles.railStateCard}>
                  <Inbox size={18} />
                  <div>
                    <p className={styles.railStateTitle}>ไม่พบหมวดที่เลือก</p>
                    <p className={styles.railStateText}>กรุณาตรวจสอบลิงก์ แล้วลองเปิดใหม่อีกครั้ง</p>
                  </div>
                </div>
              )
            ) : mainCategoryShelves.length === 0 ? (
              <div className={styles.railStateCard}>
                <Inbox size={18} />
                <div>
                  <p className={styles.railStateTitle}>ยังไม่มีเรื่องในหมวดหลักตอนนี้</p>
                  <p className={styles.railStateText}>ลองค้นหาด้วยคำอื่น แล้วระบบจะแสดงรายการเรื่องที่เกี่ยวข้องให้ทันที</p>
                </div>
              </div>
            ) : (
              <div className={styles.mainCategoryGroups}>
                {mainCategoryShelves.map((group) => (
                  <section key={`category-group-${group.id}`} className={styles.mainCategoryGroup} data-gsap-shelf-group>
                    <header className={styles.mainCategoryShelfRowHeader}>
                      <h3 className={styles.mainCategoryGroupTitle}>{group.label}</h3>
                      <Link
                        href={`/?view=grid&category=${encodeURIComponent(group.id)}`}
                        className={styles.mainCategoryShelfViewAll}
                        target="_blank"
                        rel="noreferrer"
                      >
                        ดูทั้งหมด
                      </Link>
                    </header>

                    <div className={styles.mainCategoryShelfRailWrap}>
                      <div
                        ref={(node) => setMainCategoryRailRef(group.id, node)}
                        className={styles.mainCategoryShelfRail}
                      >
                        {group.stories.map((story) => {
                          const isInteractiveStory = story.path_mode === 'branching';
                          return (
                            <Link key={`category-${group.id}-${story.id}`} href={`/story/${story.id}`} className={styles.mainCategoryShelfCard} data-gsap-card="main-category">
                              <div className={styles.mainCategoryShelfCoverWrap}>
                                {story.cover_url || story.cover_wide_url ? (
                                  <Image
                                    src={story.cover_url || story.cover_wide_url || ''}
                                    alt={story.title}
                                    className={styles.mainCategoryShelfCover}
                                    fill
                                    sizes="(max-width: 767px) 48vw, (max-width: 1180px) 24vw, 16vw"
                                  />
                                ) : (
                                  <div className={styles.mainCategoryShelfCoverFallback}>{story.title.slice(0, 2)}</div>
                                )}
                              </div>

                              <div className={styles.mainCategoryShelfBody}>
                                <h4 className={styles.mainCategoryShelfTitle}>{story.title}</h4>
                                <p className={styles.mainCategoryShelfAuthor}>{story.pen_name}</p>
                                <div className={styles.mainCategoryShelfMetaRow}>
                                  {isInteractiveStory ? (
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
                              </div>
                            </Link>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        className={styles.mainCategoryShelfArrowButton}
                        onClick={() => handleScrollMainCategoryRail(group.id)}
                        aria-label={`เลื่อนไปขวาในหมวด ${group.label}`}
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </section>
                ))}
              </div>
            )}
          </section>

          <section className={styles.editorSection} ref={editorSectionRef} data-gsap-section="editor">
            <h2 className={styles.editorSectionTitle}>คัดพิเศษจากบรรณาธิการ</h2>
            {editorFeaturedStory ? (
              <div className={styles.editorGrid}>
                <Link href={`/story/${editorFeaturedStory.id}`} className={styles.editorFeaturedCard} data-gsap-card="editor">
                  {editorFeaturedStory.cover_wide_url || editorFeaturedStory.cover_url ? (
                    <Image
                      src={editorFeaturedStory.cover_wide_url || editorFeaturedStory.cover_url || ''}
                      alt={editorFeaturedStory.title}
                      className={styles.editorFeaturedImage}
                      fill
                      sizes="(max-width: 1023px) 100vw, 58vw"
                    />
                  ) : (
                    <div className={styles.editorFeaturedFallback}>{editorFeaturedStory.title}</div>
                  )}
                  <div className={styles.editorFeaturedOverlay}>
                    <span className={styles.editorFeaturedBadge}>เรื่องคัดพิเศษ</span>
                    <h3 className={styles.editorFeaturedTitle}>{editorFeaturedStory.title}</h3>
                    <p className={styles.editorFeaturedSummary}>
                      {editorFeaturedStory.synopsis || 'เรื่องเด่นที่บรรณาธิการอยากแนะนำให้คุณเปิดอ่านทันที'}
                    </p>
                  </div>
                </Link>

                <div className={styles.editorSideList}>
                  {editorSideStories.map((story) => (
                    <Link key={`editor-side-${story.id}`} href={`/story/${story.id}`} className={styles.editorSideCard} data-gsap-card="editor">
                      <div className={styles.editorSideCoverWrap}>
                        {story.cover_url || story.cover_wide_url ? (
                          <Image
                            src={story.cover_url || story.cover_wide_url || ''}
                            alt={story.title}
                            className={styles.editorSideCover}
                            fill
                            sizes="220px"
                          />
                        ) : (
                          <div className={styles.editorSideFallback}>{story.title.slice(0, 2)}</div>
                        )}
                      </div>
                      <div className={styles.editorSideBody}>
                        <h4 className={styles.editorSideTitle}>{story.title}</h4>
                        <p className={styles.editorSideDesc}>{story.synopsis || `${story.pen_name} · เรื่องที่ไม่อยากให้พลาด`}</p>
                        <span className={styles.editorSideLink}>อ่านรีวิวเรื่องนี้</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <div className={styles.railStateCard}>
                <Inbox size={18} />
                <div>
                  <p className={styles.railStateTitle}>ยังไม่มีเรื่องแนะนำ</p>
                  <p className={styles.railStateText}>กำลังรวบรวมเรื่องเด่นสำหรับบล็อกคัดพิเศษจากบรรณาธิการ</p>
                </div>
              </div>
            )}
          </section>

          <section className={styles.writerCtaSection} ref={writerCtaSectionRef} data-gsap-section="writer-cta">
            <div className={styles.writerCtaCard}>
              <h2 className={styles.writerCtaTitle}>
                ทุกปริศนาต้องมี
                <br />
                <span className={styles.writerCtaAccent}>นักเขียนผู้วางเกม</span>
              </h2>
              <p className={styles.writerCtaText}>
                ถ้าคุณมีเรื่องลึกลับในหัว ถึงเวลาปล่อยให้ผู้อ่านทั่วแพลตฟอร์มได้ติดตามไปกับมัน
              </p>
              {user ? (
                <Link href="/story/create" className={styles.writerCtaButton}>
                  เริ่มสร้างนิยายของคุณ
                  <PenTool size={16} />
                </Link>
              ) : (
                <button type="button" className={styles.writerCtaButton} onClick={handleOpenLoginDialog}>
                  เข้าสู่ระบบเพื่อเริ่มเขียน
                  <PenTool size={16} />
                </button>
              )}
            </div>
          </section>
        </div>

        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <div className={styles.footerBrand}>
              <span className={styles.footerBrandName}>FlowFic</span>
              <p className={styles.footerCopy}>© 2026 FlowFic Anthology. สงวนลิขสิทธิ์ทั้งหมด</p>
            </div>
            <div className={styles.footerLinks}>
              <Link href="/legal-contact-and-versioning">เกี่ยวกับเรา</Link>
              <Link href="/terms">ข้อกำหนดการใช้งาน</Link>
              <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link>
              <Link href="/billing-policies">ศูนย์ช่วยเหลือ</Link>
            </div>
          </div>
        </footer>
      </div>

      {/* Profile Modal */}
      {isProfileModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modalContent} ${styles.profileModalWide}`}>
            <div className={styles.modalHeader}>
              <h2>ตั้งค่าโปรไฟล์นักเขียน</h2>
              <button className={styles.closeBtn} onClick={() => setIsProfileModalOpen(false)} type="button">
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.avatarSection}>
                {avatarPreviewUrl ? (
                  <img src={avatarPreviewUrl} alt="Preview" className={styles.avatarPreview} />
                ) : (
                  <div className={styles.avatarPlaceholder}>{editProfile.pen_name.charAt(0).toUpperCase() || 'W'}</div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleAvatarChange}
                />
                <button className={styles.uploadLabel} onClick={() => fileInputRef.current?.click()} type="button">
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
              <button className={styles.cancelBtn} onClick={() => setIsProfileModalOpen(false)} disabled={isSavingProfile}>
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

      {isDashboardAuthDialogOpen && (
        <div className={styles.modalOverlay} onClick={handleCloseDashboardAuthDialog}>
          <div
            className={`${styles.modalContent} ${styles.authGuardDialog}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-auth-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2 id="dashboard-auth-dialog-title">{dashboardAuthDialogTitle}</h2>
              <button className={styles.closeBtn} onClick={handleCloseDashboardAuthDialog} type="button">
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.authDialogLead}>
                {dashboardAuthDialogMessage || 'กรุณาเข้าสู่ระบบก่อนเข้าแดชบอร์ดนักเขียน'}
              </p>
              {!isLoadingAuth && !user && (
                <div className={styles.authDialogButtons}>
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className={`${styles.authBtn} ${styles.googleBtn}`}
                  >
                    <img
                      src="/google-logo.svg"
                      alt="G"
                      className={styles.providerIcon}
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                    เข้าสู่ระบบด้วย Google
                  </button>
                  <button
                    type="button"
                    onClick={handleFacebookSignIn}
                    className={`${styles.authBtn} ${styles.facebookBtn}`}
                  >
                    <img
                      src="/facebook-logo.svg"
                      alt="f"
                      className={styles.providerIcon}
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                    เข้าสู่ระบบด้วย Facebook
                  </button>
                </div>
              )}
              {authError && <p className={styles.authDialogError}>{authError}</p>}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={handleCloseDashboardAuthDialog} type="button">
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
