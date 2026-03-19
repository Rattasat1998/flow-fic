'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Menu,
  PenTool,
  Bookmark,
  Heart,
  Settings,
  LogOut,
  Upload,
  X,
  Bell,
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
  Flame,
  Rocket,
  AlertCircle,
  Inbox,
  Coins,
  Eye,
  List,
} from 'lucide-react';
import styles from '@/app/home.module.css';
import { supabase } from '@/lib/supabase';
import { FEATURE_FLAGS } from '@/lib/featureFlags';
import {
  CORE_MAIN_CATEGORY_ID,
  MAIN_CATEGORIES,
  getMainCategoryLabel,
  getSubCategoryLabel,
} from '@/lib/categories';
import { useAuth } from '@/contexts/AuthContext';
import { WalletLedgerPanel } from '@/components/profile/WalletLedgerPanel';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { useTracking } from '@/hooks/useTracking';
import type {
  DiscoveryCategoryFilter,
  DiscoveryCompletionFilter,
  DiscoveryFilters,
  DiscoveryLengthFilter,
  DiscoveryRailKey,
  DiscoveryResponse,
  DiscoveryStory,
  DiscoverySubCategoryFilter,
} from '@/types/discovery';

const DISCOVERY_LIMIT = 12;
const DISCOVERY_CACHE_PREFIX = 'ff_home_discovery::';
const DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000;
const DISCOVERY_CORE_FOCUS_ENABLED = FEATURE_FLAGS.discoveryCoreFocus;
const DEFAULT_DISCOVERY_CATEGORY: DiscoveryCategoryFilter = 'all';
const DEFAULT_DISCOVERY_SUB_CATEGORY: DiscoverySubCategoryFilter = 'all';
const DEFAULT_DISCOVERY_COMPLETION: DiscoveryCompletionFilter = 'all';
const DEFAULT_DISCOVERY_LENGTH: DiscoveryLengthFilter = 'all';
const DEFAULT_DISCOVERY_FOCUS_CORE = false;
const HERO_ROTATION_MS = 7000;
const HERO_STORY_LIMIT = 5;
const FILTER_CHANGE_TRACK_SAMPLE_RATE = 0.35;
const VALID_COMPLETIONS = new Set<DiscoveryCompletionFilter>(['all', 'ongoing', 'completed']);
const VALID_LENGTHS = new Set<DiscoveryLengthFilter>(['all', 'short', 'medium', 'long']);

const COMPLETION_FILTERS: Array<{ id: DiscoveryCompletionFilter; label: string }> = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'ongoing', label: 'ยังไม่จบ' },
  { id: 'completed', label: 'จบแล้ว' },
];

const LENGTH_FILTERS: Array<{ id: DiscoveryLengthFilter; label: string }> = [
  { id: 'all', label: 'ทุกความยาว' },
  { id: 'short', label: 'สั้น (1-5 ตอน)' },
  { id: 'medium', label: 'กลาง (6-20 ตอน)' },
  { id: 'long', label: 'ยาว (21+ ตอน)' },
];

const SUB_CATEGORY_FILTERS: Array<{ id: DiscoverySubCategoryFilter; label: string }> = [
  { id: 'all', label: 'ทั้งหมดในหมวดสืบสวน/สยอง' },
  { id: 'mystery_horror', label: 'สยองขวัญ' },
  { id: 'mystery_detective', label: 'สืบสวน' },
];

const RAILS: Array<{
  key: DiscoveryRailKey;
  title: string;
  eyebrow: string;
  emptyLabel: string;
}> = [
  { key: 'trending', title: 'Trending Now', eyebrow: 'กำลังมาแรง', emptyLabel: 'ยังไม่มีเรื่องกำลังมาแรงที่ตรงกับตัวกรองนี้' },
  { key: 'popular', title: 'ยอดฮิตของสัปดาห์นี้', eyebrow: 'ยอดนิยม', emptyLabel: 'ยังไม่มีเรื่องยอดนิยมที่ตรงกับตัวกรองนี้' },
  { key: 'new', title: 'มาใหม่ล่าสุด', eyebrow: 'มาใหม่', emptyLabel: 'ยังไม่มีเรื่องใหม่ที่ตรงกับตัวกรองนี้' },
];

type HomeRailState = {
  items: DiscoveryStory[];
  error: string | null;
  loading: boolean;
};

type HomeRailsState = Record<DiscoveryRailKey, HomeRailState>;

type HomeFilterInput = Pick<
  DiscoveryFilters,
  'q' | 'category' | 'subCategory' | 'completion' | 'length' | 'focusCore'
>;

type HomeNavTabConfig = {
  id: 'mystery_all' | 'mystery_horror' | 'mystery_detective';
  label: string;
  category: DiscoveryCategoryFilter;
  subCategory: DiscoverySubCategoryFilter;
};

type UserProfile = {
  pen_name: string;
  bio: string;
  avatar_url: string | null;
};

type DiscoveryCacheEntry = {
  timestamp: number;
  payload: DiscoveryResponse;
};

const HOME_NAV_TABS: HomeNavTabConfig[] = [
  {
    id: 'mystery_all',
    label: 'สยอง/สืบสวน',
    category: CORE_MAIN_CATEGORY_ID,
    subCategory: 'all',
  },
  {
    id: 'mystery_horror',
    label: 'สยองขวัญ',
    category: CORE_MAIN_CATEGORY_ID,
    subCategory: 'mystery_horror',
  },
  {
    id: 'mystery_detective',
    label: 'สืบสวน',
    category: CORE_MAIN_CATEGORY_ID,
    subCategory: 'mystery_detective',
  },
];

const isModifiedLinkClick = (event: React.MouseEvent<HTMLAnchorElement>) =>
  event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;

function createInitialRails(loading: boolean): HomeRailsState {
  return {
    new: { items: [], error: null, loading },
    popular: { items: [], error: null, loading },
    trending: { items: [], error: null, loading },
  };
}

function formatGeneratedAt(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleString('th-TH', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
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

function parseFiltersFromSearch(search: string): DiscoveryFilters {
  const params = new URLSearchParams(search);
  const completionRaw = (params.get('completion') || DEFAULT_DISCOVERY_COMPLETION).trim() as DiscoveryCompletionFilter;
  const lengthRaw = (params.get('length') || DEFAULT_DISCOVERY_LENGTH).trim() as DiscoveryLengthFilter;
  const focusRaw = (params.get('focusCore') || '').trim().toLowerCase();
  const categoryRaw = (params.get('category') || DEFAULT_DISCOVERY_CATEGORY).trim();
  const subCategoryRaw = (params.get('subCategory') || DEFAULT_DISCOVERY_SUB_CATEGORY).trim();

  return {
    q: (params.get('q') || '').trim().slice(0, 120),
    category: categoryRaw || DEFAULT_DISCOVERY_CATEGORY,
    subCategory: subCategoryRaw || DEFAULT_DISCOVERY_SUB_CATEGORY,
    completion: VALID_COMPLETIONS.has(completionRaw) ? completionRaw : DEFAULT_DISCOVERY_COMPLETION,
    length: VALID_LENGTHS.has(lengthRaw) ? lengthRaw : DEFAULT_DISCOVERY_LENGTH,
    focusCore: FEATURE_FLAGS.discoveryCoreFocus
      ? (focusRaw === 'false' || focusRaw === '0'
        ? false
        : focusRaw === 'true' || focusRaw === '1'
          ? true
          : DEFAULT_DISCOVERY_FOCUS_CORE)
      : false,
    limit: DISCOVERY_LIMIT,
  };
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
  initialFilters: DiscoveryFilters;
  initialDiscovery: DiscoveryResponse;
};

export default function HomePageClient({ initialFilters, initialDiscovery }: HomePageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: isLoadingAuth, signInWithFacebook, signInWithGoogle, signOut } = useAuth();
  const userId = user?.id ?? null;
  const { trackEvent } = useTracking({ autoPageView: true, pagePath: '/' });

  const [authError, setAuthError] = useState<string | null>(null);
  const [isDashboardAuthDialogOpen, setIsDashboardAuthDialogOpen] = useState(false);
  const [dashboardAuthDialogMessage, setDashboardAuthDialogMessage] = useState<string | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [walletCoinBalance, setWalletCoinBalance] = useState<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Profile Settings State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile>({ pen_name: 'Flow Writer', bio: '', avatar_url: null });
  const [editProfile, setEditProfile] = useState<UserProfile>({ pen_name: '', bio: '', avatar_url: null });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialApiQuery = useMemo(
    () => buildApiQueryFromFilters({ ...initialFilters, limit: DISCOVERY_LIMIT }),
    [initialFilters]
  );
  const serverPrefetchQueryRef = useRef<string | null>(initialApiQuery);

  const [urlFilters, setUrlFilters] = useState<DiscoveryFilters>({
    ...initialFilters,
    limit: DISCOVERY_LIMIT,
  });

  const [searchInput, setSearchInput] = useState(urlFilters.q);
  const [rails, setRails] = useState<HomeRailsState>(() => railsFromPayload(initialDiscovery, false));
  const [generatedAt, setGeneratedAt] = useState<string | null>(initialDiscovery.generatedAt);
  const [heroIndex, setHeroIndex] = useState(0);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  const buildDiscoveryUrl = useCallback(
    (next: HomeFilterInput) => {
      const params = new URLSearchParams();
      const trimmedQ = next.q.trim();

      if (trimmedQ) params.set('q', trimmedQ);
      else params.delete('q');

      if (next.category === 'all') params.set('category', 'all');
      else params.set('category', next.category);

      if (next.subCategory !== 'all') params.set('subCategory', next.subCategory);
      else params.delete('subCategory');

      if (next.completion !== 'all') params.set('completion', next.completion);
      else params.delete('completion');

      if (next.length !== 'all') params.set('length', next.length);
      else params.delete('length');

      params.set('focusCore', next.focusCore ? 'true' : 'false');

      params.delete('limit');

      const query = params.toString();
      return query ? `/?${query}` : '/';
    },
    []
  );

  const navigateWithFilters = useCallback(
    (next: HomeFilterInput) => {
      const normalizedNext: DiscoveryFilters = {
        q: next.q.trim(),
        category: next.category,
        subCategory: next.subCategory,
        completion: next.completion,
        length: next.length,
        focusCore: next.focusCore,
        limit: DISCOVERY_LIMIT,
      };

      setUrlFilters(normalizedNext);
      const url = buildDiscoveryUrl(normalizedNext);
      router.replace(url, { scroll: false });
    },
    [buildDiscoveryUrl, router]
  );

  const trackFilterChange = useCallback(
    (next: Partial<{
      q: string;
      category: DiscoveryCategoryFilter;
      subCategory: DiscoverySubCategoryFilter;
      completion: DiscoveryCompletionFilter;
      length: DiscoveryLengthFilter;
      focusCore: boolean;
    }>) => {
      if (Math.random() > FILTER_CHANGE_TRACK_SAMPLE_RATE) return;

      const merged = {
        q: next.q ?? urlFilters.q,
        category: next.category ?? urlFilters.category,
        subCategory: next.subCategory ?? urlFilters.subCategory,
        completion: next.completion ?? urlFilters.completion,
        length: next.length ?? urlFilters.length,
        focusCore: next.focusCore ?? urlFilters.focusCore,
      };

      trackEvent('filter_change', '/', {
        metadata: {
          search_query: merged.q || undefined,
          category_filter: merged.category,
          sub_category_filter: merged.subCategory !== 'all' ? merged.subCategory : undefined,
          completion_filter: merged.completion,
          length_filter: merged.length,
          focus_core: merged.focusCore,
        },
      });
    },
    [trackEvent, urlFilters]
  );

  useEffect(() => {
    setSearchInput(urlFilters.q);
  }, [urlFilters.q]);

  useEffect(() => {
    setUrlFilters(parseFiltersFromSearch(searchParams.toString()));
  }, [searchParams]);

  useEffect(() => {
    const normalizedInput = searchInput.trim();
    if (normalizedInput === urlFilters.q) return;

    const timer = window.setTimeout(() => {
      navigateWithFilters({
        q: normalizedInput,
        category: urlFilters.category,
        subCategory: urlFilters.subCategory,
        completion: urlFilters.completion,
        length: urlFilters.length,
        focusCore: urlFilters.focusCore,
      });

      trackFilterChange({ q: normalizedInput });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchInput, urlFilters, navigateWithFilters, trackFilterChange]);

  const apiQuery = useMemo(() => {
    return buildApiQueryFromFilters(urlFilters);
  }, [urlFilters]);

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
      setGeneratedAt(payload.generatedAt);
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
        setGeneratedAt(null);
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
    setDashboardAuthDialogMessage(null);
    setAuthError(null);
  };

  const handleDashboardAccess = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (isLoadingAuth) {
      event.preventDefault();
      setAuthError(null);
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
    setDashboardAuthDialogMessage('เข้าสู่ระบบเพื่อดูสถิติ จัดการเรื่อง และตั้งค่าการเผยแพร่ในแดชบอร์ดนักเขียน');
    setIsDashboardAuthDialogOpen(true);
    setIsProfileMenuOpen(false);
  };

  const handleSelectCategory = (category: DiscoveryCategoryFilter) => {
    const nextSubCategory: DiscoverySubCategoryFilter = category === CORE_MAIN_CATEGORY_ID ? urlFilters.subCategory : 'all';
    navigateWithFilters({
      q: urlFilters.q,
      category,
      subCategory: nextSubCategory,
      completion: urlFilters.completion,
      length: urlFilters.length,
      focusCore: category === CORE_MAIN_CATEGORY_ID ? urlFilters.focusCore : false,
    });

    trackFilterChange({
      category,
      subCategory: nextSubCategory,
      focusCore: category === CORE_MAIN_CATEGORY_ID ? urlFilters.focusCore : false,
    });
  };

  const handleSelectSubCategory = (subCategory: DiscoverySubCategoryFilter) => {
    navigateWithFilters({
      q: urlFilters.q,
      category: CORE_MAIN_CATEGORY_ID,
      subCategory,
      completion: urlFilters.completion,
      length: urlFilters.length,
      focusCore: DEFAULT_DISCOVERY_FOCUS_CORE,
    });

    trackFilterChange({
      category: CORE_MAIN_CATEGORY_ID,
      subCategory,
      focusCore: DEFAULT_DISCOVERY_FOCUS_CORE,
    });
  };

  const handleSelectCompletion = (completion: DiscoveryCompletionFilter) => {
    navigateWithFilters({
      q: urlFilters.q,
      category: urlFilters.category,
      subCategory: urlFilters.subCategory,
      completion,
      length: urlFilters.length,
      focusCore: urlFilters.focusCore,
    });

    trackFilterChange({ completion });
  };

  const handleSelectLength = (length: DiscoveryLengthFilter) => {
    navigateWithFilters({
      q: urlFilters.q,
      category: urlFilters.category,
      subCategory: urlFilters.subCategory,
      completion: urlFilters.completion,
      length,
      focusCore: urlFilters.focusCore,
    });

    trackFilterChange({ length });
  };

  const handleNavbarTabClick = useCallback(
    (
      event: React.MouseEvent<HTMLAnchorElement>,
      target: Pick<HomeNavTabConfig, 'category' | 'subCategory'>
    ) => {
      if (event.defaultPrevented || isModifiedLinkClick(event)) return;

      event.preventDefault();

      navigateWithFilters({
        q: urlFilters.q,
        category: target.category,
        subCategory: target.subCategory,
        completion: urlFilters.completion,
        length: urlFilters.length,
        focusCore: DEFAULT_DISCOVERY_FOCUS_CORE,
      });

      trackFilterChange({
        category: target.category,
        subCategory: target.subCategory,
        focusCore: DEFAULT_DISCOVERY_FOCUS_CORE,
      });
    },
    [navigateWithFilters, trackFilterChange, urlFilters.completion, urlFilters.length, urlFilters.q]
  );

  const homeNavTabs = useMemo(
    () =>
      HOME_NAV_TABS.map((tab) => ({
        ...tab,
        href: buildDiscoveryUrl({
          q: urlFilters.q,
          category: tab.category,
          subCategory: tab.subCategory,
          completion: urlFilters.completion,
          length: urlFilters.length,
          focusCore: DEFAULT_DISCOVERY_FOCUS_CORE,
        }),
        isActive:
          urlFilters.category === tab.category
          && urlFilters.subCategory === tab.subCategory,
      })),
    [
      buildDiscoveryUrl,
      urlFilters.category,
      urlFilters.completion,
      urlFilters.length,
      urlFilters.q,
      urlFilters.subCategory,
    ]
  );

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

  const heroMetaLine = useMemo(() => {
    if (!heroStory) return '';

    const completionLabel = heroStory.completion_status === 'completed' ? 'จบแล้ว' : 'กำลังอัปเดต';
    const chapterLabel = `${heroStory.published_chapter_count.toLocaleString('th-TH')} ตอน`;
    const pathLabel = heroStory.path_mode === 'branching' ? 'Interactive' : 'Linear';

    return `${completionLabel} · ${chapterLabel} · ${pathLabel}`;
  }, [heroStory]);

  const heroInfoPills = useMemo(() => {
    if (!heroStory) return [];

    const typeLabel = heroStory.category === 'fanfic' ? 'แฟนฟิค' : 'ออริจินัล';
    const mainCategoryLabel = getMainCategoryLabel(heroStory.main_category);
    const subCategoryLabel = getSubCategoryLabel(heroStory.sub_category);

    return [typeLabel, mainCategoryLabel, subCategoryLabel].filter(Boolean) as string[];
  }, [heroStory]);

  const selectedCategoryLabel = useMemo(() => {
    if (urlFilters.category === 'all') return null;
    return getMainCategoryLabel(urlFilters.category);
  }, [urlFilters.category]);

  const selectedSubCategoryLabel = useMemo(() => {
    if (urlFilters.subCategory === 'all') return null;
    return getSubCategoryLabel(urlFilters.subCategory);
  }, [urlFilters.subCategory]);

  const activeFilterPills = useMemo(() => {
    const pills: Array<{ id: string; label: string }> = [];

    if (urlFilters.q) pills.push({ id: 'q', label: `ค้นหา: "${urlFilters.q}"` });
    if (urlFilters.category !== DEFAULT_DISCOVERY_CATEGORY && selectedCategoryLabel) {
      pills.push({ id: 'category', label: `หมวด: ${selectedCategoryLabel}` });
    }
    if (selectedSubCategoryLabel) pills.push({ id: 'subCategory', label: `ประเภทย่อย: ${selectedSubCategoryLabel}` });
    if (urlFilters.completion !== DEFAULT_DISCOVERY_COMPLETION) {
      const completionLabel =
        COMPLETION_FILTERS.find((item) => item.id === urlFilters.completion)?.label || urlFilters.completion;
      pills.push({ id: 'completion', label: `สถานะ: ${completionLabel}` });
    }
    if (urlFilters.length !== DEFAULT_DISCOVERY_LENGTH) {
      const lengthLabel = LENGTH_FILTERS.find((item) => item.id === urlFilters.length)?.label || urlFilters.length;
      pills.push({ id: 'length', label: `ความยาว: ${lengthLabel}` });
    }
    if (DISCOVERY_CORE_FOCUS_ENABLED && urlFilters.focusCore !== DEFAULT_DISCOVERY_FOCUS_CORE) {
      pills.push({ id: 'focusCore', label: 'ปิดโฟกัสคอร์หลัก' });
    }

    return pills;
  }, [
    urlFilters.q,
    urlFilters.category,
    urlFilters.completion,
    urlFilters.length,
    urlFilters.focusCore,
    selectedCategoryLabel,
    selectedSubCategoryLabel,
  ]);

  const hasActiveFilters = activeFilterPills.length > 0;
  const filterToggleLabel = isFilterPanelOpen
    ? 'ซ่อนฟิลเตอร์'
    : hasActiveFilters
      ? `ฟิลเตอร์ (${activeFilterPills.length})`
      : 'ฟิลเตอร์';

  const handleResetFilters = () => {
    setSearchInput('');
    navigateWithFilters({
      q: '',
      category: DEFAULT_DISCOVERY_CATEGORY,
      subCategory: DEFAULT_DISCOVERY_SUB_CATEGORY,
      completion: DEFAULT_DISCOVERY_COMPLETION,
      length: DEFAULT_DISCOVERY_LENGTH,
      focusCore: DEFAULT_DISCOVERY_FOCUS_CORE,
    });

    trackFilterChange({
      q: '',
      category: DEFAULT_DISCOVERY_CATEGORY,
      subCategory: DEFAULT_DISCOVERY_SUB_CATEGORY,
      completion: DEFAULT_DISCOVERY_COMPLETION,
      length: DEFAULT_DISCOVERY_LENGTH,
      focusCore: DEFAULT_DISCOVERY_FOCUS_CORE,
    });
  };

  return (
        <main className={styles.main}>
          {/* Top Navbar */}
          <nav className={styles.navbar}>
            <div className={styles.navLeft}>
              <BrandLogo href="/" size="lg" className={styles.logo} />
              <div className={styles.navLinks}>
                {homeNavTabs.map((tab) => (
                  <Link
                    key={tab.id}
                    href={tab.href}
                    className={tab.isActive ? styles.activeLink : undefined}
                    aria-current={tab.isActive ? 'page' : undefined}
                    onClick={(event) => handleNavbarTabClick(event, tab)}
                  >
                    {tab.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className={styles.navSearchWrap}>
              <Search size={16} className={styles.navSearchIcon} />
              <input
                ref={searchInputRef}
                className={styles.navSearchInput}
                placeholder="ค้นหาเรื่อง, คำโปรย, หรือนามปากกา"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
              <span className={styles.navSearchHint}>⌘K</span>
            </div>

            <div className={styles.navRight}>
              {user ? (
                <Link href="/pricing" prefetch={false} className={styles.coinBalancePill}>
                  <Coins size={15} />
                  <span>{walletCoinBalance === null ? '...' : `${walletCoinBalance.toLocaleString('th-TH')} เหรียญ`}</span>
                </Link>
              ) : (
                <Link href="/pricing" prefetch={false} className={styles.pricingLink}>
                  แพ็กเกจ
                </Link>
              )}
              <Link href="/dashboard" className={styles.dashboardLink} onClick={handleDashboardAccess}>
                แดชบอร์ดนักเขียน
              </Link>
              {user && (
                <Link href="/notifications" className={styles.notifBellBtn}>
                  <Bell size={18} />
                  {unreadNotifCount > 0 && (
                    <span className={styles.notifBadge}>{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</span>
                  )}
                </Link>
              )}

              {isLoadingAuth ? (
                <div className={styles.authLoading}>...</div>
              ) : user ? (
                <div className={styles.profileMenuWrapper} ref={profileMenuRef}>
                  <div className={styles.profileAvatarBtn} onClick={() => setIsProfileMenuOpen((prev) => !prev)}>
                    {user.user_metadata?.avatar_url ? (
                      <img src={user.user_metadata.avatar_url} alt="Profile" className={styles.userAvatar} />
                    ) : (
                      <div className={styles.userAvatarPlaceholder}>
                        {user.email?.charAt(0).toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>

                  {isProfileMenuOpen && (
                    <div className={styles.profileDropdown}>
                      <div className={styles.profileDropdownHeader}>
                        <div className={styles.profileDropdownAvatar}>
                          {user.user_metadata?.avatar_url ? (
                            <img
                              src={user.user_metadata.avatar_url}
                              alt=""
                              style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                            />
                          ) : (
                            (user.email?.charAt(0) || 'U').toUpperCase()
                          )}
                        </div>
                        <div className={styles.profileDropdownInfo}>
                          <div className={styles.profileDropdownName}>
                            {user.user_metadata?.full_name || user.email?.split('@')[0]}
                          </div>
                          <div className={styles.profileDropdownEmail}>{user.email || ''}</div>
                        </div>
                      </div>

                      <div className={styles.profileDropdownDivider} />

                      <Link href="/dashboard" className={styles.profileDropdownItem} onClick={handleDashboardAccess}>
                        <PenTool size={16} /> แดชบอร์ดนักเขียน
                      </Link>
                      <Link href="/bookshelf" className={styles.profileDropdownItem} onClick={() => setIsProfileMenuOpen(false)}>
                        <Bookmark size={16} /> ชั้นหนังสือ
                      </Link>
                      <Link href="/loves" className={styles.profileDropdownItem} onClick={() => setIsProfileMenuOpen(false)}>
                        <Heart size={16} /> รักเลย
                      </Link>
                      <button
                        className={styles.profileDropdownItem}
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          handleOpenProfileModal();
                        }}
                      >
                        <Settings size={16} /> ตั้งค่าโปรไฟล์
                      </button>

                      <div className={styles.profileDropdownDivider} />

                      <button
                        className={`${styles.profileDropdownItem} ${styles.profileDropdownLogout}`}
                        onClick={handleSignOut}
                      >
                        <LogOut size={16} /> ออกจากระบบ
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className={styles.authButtons}>
                  <button onClick={handleGoogleSignIn} className={`${styles.authBtn} ${styles.googleBtn}`}>
                    <img
                      src="/google-logo.svg"
                      alt="G"
                      className={styles.providerIcon}
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                    เข้าสู่ระบบด้วย Google
                  </button>
                  <button onClick={handleFacebookSignIn} className={`${styles.authBtn} ${styles.facebookBtn}`}>
                    <img
                      src="/facebook-logo.svg"
                      alt="f"
                      className={styles.providerIcon}
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                    Facebook
                  </button>
                </div>
              )}

              <button className={styles.mobileMenuBtn} type="button">
                <Menu size={24} />
              </button>
            </div>
          </nav>

      <div className={styles.content}>
        {authError && !isDashboardAuthDialogOpen && (
          <div className={styles.emptyMyNovels} style={{ color: '#b00020' }}>
            {authError}
          </div>
        )}

        <section className={styles.heroSection}>
          {heroStory ? (
            <div className={styles.heroFrame}>
              {heroStory.cover_wide_url || heroStory.cover_url ? (
                <Image
                  src={heroStory.cover_wide_url || heroStory.cover_url || ''}
                  alt={heroStory.title}
                  className={styles.heroBackdrop}
                  fill
                  priority={heroIndex === 0}
                  sizes="(max-width: 768px) 100vw, 1200px"
                />
              ) : (
                <div className={styles.heroBackdropFallback}>{heroStory.title}</div>
              )}

              <div className={styles.heroOverlay} />

              <div className={styles.heroPosterOnly}>
                <Link href={`/story/${heroStory.id}`} className={styles.heroStoryLink}>
                  <div className={styles.heroVisualRow}>
                    <div className={styles.heroPosterCard}>
                      {heroStory.cover_url || heroStory.cover_wide_url ? (
                        <Image
                          src={heroStory.cover_url || heroStory.cover_wide_url || ''}
                          alt={heroStory.title}
                          className={styles.heroPosterImage}
                          fill
                          sizes="(max-width: 768px) 128px, 168px"
                        />
                      ) : (
                        <div className={styles.heroPosterFallback}>NO COVER</div>
                      )}
                    </div>
                    <div className={styles.heroStoryInfo}>
                      <h1 className={styles.heroStoryTitle}>{heroStory.title}</h1>
                      <p className={styles.heroStoryPen}>{heroStory.pen_name}</p>
                      <p className={styles.heroStoryMeta}>{heroMetaLine}</p>
                      {heroStory.synopsis && <p className={styles.heroStorySynopsis}>{heroStory.synopsis}</p>}
                      {heroInfoPills.length > 0 && (
                        <div className={styles.heroInfoPills}>
                          {heroInfoPills.map((pill) => (
                            <span key={pill} className={styles.heroInfoPill}>
                              {pill}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
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
            <div className={styles.heroEmpty}>กำลังโหลดเรื่องแนะนำประจำวัน...</div>
          )}
        </section>

        <section className={styles.quickControls}>
          <button
            type="button"
            className={styles.filterToggleBtn}
            onClick={() => setIsFilterPanelOpen((prev) => !prev)}
          >
            <SlidersHorizontal size={15} />
            {filterToggleLabel}
          </button>
        </section>

        {isFilterPanelOpen && (
          <section className={`${styles.section} ${styles.discoveryPanel}`}>
            <div className={styles.discoveryPanelTop}>
              <div className={styles.discoveryMeta}>อัปเดต: {formatGeneratedAt(generatedAt) || '-'}</div>
            </div>

            <div className={styles.filterGroup}>
              <div className={styles.filterGroupLabel}>หมวดหมู่หลัก</div>
              <div className={styles.categoryFilters}>
                <button
                  className={`${styles.filterBtn} ${urlFilters.category === 'all' ? styles.activeFilter : ''}`}
                  onClick={() => handleSelectCategory('all')}
                  type="button"
                >
                  ทุกหมวด
                </button>
                {MAIN_CATEGORIES.map((category) => (
                  <button
                    key={category.id}
                    className={`${styles.filterBtn} ${urlFilters.category === category.id ? styles.activeFilter : ''}`}
                    onClick={() => handleSelectCategory(category.id)}
                    type="button"
                  >
                    {category.label}
                  </button>
                ))}
              </div>
            </div>

            {urlFilters.category === CORE_MAIN_CATEGORY_ID && (
              <div className={styles.filterGroup}>
                <div className={styles.filterGroupLabel}>โฟกัสย่อย (คอร์หลัก)</div>
                <div className={styles.categoryFilters}>
                  {SUB_CATEGORY_FILTERS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`${styles.filterBtn} ${urlFilters.subCategory === option.id ? styles.activeFilter : ''}`}
                      onClick={() => handleSelectSubCategory(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.filterGrid}>
              <div className={styles.filterGroup}>
                <div className={styles.filterGroupLabel}>สถานะเรื่อง</div>
                <div className={styles.categoryFilters}>
                  {COMPLETION_FILTERS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`${styles.filterBtn} ${urlFilters.completion === option.id ? styles.activeFilter : ''}`}
                      onClick={() => handleSelectCompletion(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.filterGroup}>
                <div className={styles.filterGroupLabel}>ความยาว</div>
                <div className={styles.categoryFilters}>
                  {LENGTH_FILTERS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`${styles.filterBtn} ${urlFilters.length === option.id ? styles.activeFilter : ''}`}
                      onClick={() => handleSelectLength(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {hasActiveFilters && (
              <div className={styles.activeFiltersWrap}>
                <div className={styles.activeFilters}>
                  {activeFilterPills.map((pill) => (
                    <span key={pill.id} className={styles.activeFilterPill}>
                      {pill.label}
                    </span>
                  ))}
                </div>
                <button type="button" className={styles.resetFiltersBtn} onClick={handleResetFilters}>
                  <RotateCcw size={14} />
                  ล้างตัวกรอง
                </button>
              </div>
            )}
          </section>
        )}

        {RAILS.map((railConfig) => {
          const railState = rails[railConfig.key];
          const railIcon =
            railConfig.key === 'new' ? (
              <Sparkles size={14} />
            ) : railConfig.key === 'popular' ? (
              <Flame size={14} />
            ) : (
              <Rocket size={14} />
            );

          return (
            <section className={`${styles.section} ${styles.railSection}`} key={railConfig.key}>
              <div className={styles.railHeader}>
                <div className={styles.railTitleGroup}>
                  <span className={styles.railEyebrow}>
                    {railIcon}
                    {railConfig.eyebrow}
                  </span>
                  <h2 className={styles.sectionTitle}>{railConfig.title}</h2>
                </div>
                <span className={styles.railCountBadge}>{railState.items.length} เรื่อง</span>
              </div>

              {railState.loading ? (
                <div className={styles.storiesRail}>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={`${railConfig.key}-skeleton-${index}`} className={styles.storySkeleton} />
                  ))}
                </div>
              ) : railState.error ? (
                <div className={`${styles.railStateCard} ${styles.railStateError}`}>
                  <AlertCircle size={18} />
                  <div>
                    <p className={styles.railStateTitle}>โหลดข้อมูลไม่สำเร็จ</p>
                    <p className={styles.railStateText}>{railState.error}</p>
                  </div>
                </div>
              ) : railState.items.length === 0 ? (
                <div className={styles.railStateCard}>
                  <Inbox size={18} />
                  <div>
                    <p className={styles.railStateTitle}>ยังไม่มีข้อมูล</p>
                    <p className={styles.railStateText}>{railConfig.emptyLabel}</p>
                  </div>
                </div>
              ) : (
                <div className={styles.storiesRail}>
                  {railState.items.map((story, index) => {
                    const isInteractiveStory = story.path_mode === 'branching';

                    return (
                      <Link
                        key={`${railConfig.key}-${story.id}`}
                        href={`/story/${story.id}`}
                        className={styles.posterCard}
                      >
                        <div className={styles.posterCoverWrap}>
                          {story.cover_url || story.cover_wide_url ? (
                            <Image
                              src={story.cover_url || story.cover_wide_url || ''}
                              alt={story.title}
                              className={styles.posterCover}
                              fill
                              sizes="(max-width: 768px) 45vw, 220px"
                            />
                          ) : (
                            <div className={styles.posterCoverFallback}>{story.title.slice(0, 2)}</div>
                          )}

                          <div className={styles.posterTopBadges}>
                            {railConfig.key === 'trending' && index < 3 && (
                              <span className={styles.posterRankBadge}>#{index + 1}</span>
                            )}
                            {story.completion_status === 'completed' && (
                              <span className={styles.posterCompletedBadge}>จบแล้ว</span>
                            )}
                          </div>
                        </div>

                        <div className={styles.posterBody}>
                          <h3 className={styles.posterTitle}>{story.title}</h3>
                          <p className={styles.posterAuthor}>{story.pen_name}</p>
                          <div className={styles.posterMetaRow}>
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
            </section>
          );
        })}
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
              <h2 id="dashboard-auth-dialog-title">เข้าสู่ระบบก่อนเข้าแดชบอร์ดนักเขียน</h2>
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
