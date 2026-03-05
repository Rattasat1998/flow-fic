'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from 'lucide-react';
import styles from './home.module.css';
import { supabase } from '@/lib/supabase';
import { MAIN_CATEGORIES } from '@/lib/categories';
import { useAuth } from '@/contexts/AuthContext';
import { CompactStoryCard } from '@/components/story/CompactStoryCard';
import { WalletLedgerPanel } from '@/components/profile/WalletLedgerPanel';
import { useTracking } from '@/hooks/useTracking';
import type {
  DiscoveryCategoryFilter,
  DiscoveryCompletionFilter,
  DiscoveryLengthFilter,
  DiscoveryRailKey,
  DiscoveryResponse,
  DiscoveryStory,
} from '@/types/discovery';

const DISCOVERY_LIMIT = 12;
const DISCOVERY_CACHE_PREFIX = 'ff_home_discovery::';
const DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000;

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

const RAILS: Array<{
  key: DiscoveryRailKey;
  title: string;
  eyebrow: string;
  emptyLabel: string;
}> = [
  { key: 'new', title: 'มาใหม่', eyebrow: 'ล่าสุด', emptyLabel: 'ยังไม่มีเรื่องใหม่ที่ตรงกับตัวกรองนี้' },
  { key: 'popular', title: 'ยอดนิยม', eyebrow: 'คะแนนรวมสูง', emptyLabel: 'ยังไม่มีเรื่องยอดนิยมที่ตรงกับตัวกรองนี้' },
  { key: 'trending', title: 'กำลังมาแรง', eyebrow: 'แรงช่วงสั้น', emptyLabel: 'ยังไม่มีเรื่องกำลังมาแรงที่ตรงกับตัวกรองนี้' },
];

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

function parseCompletion(value: string | null): DiscoveryCompletionFilter {
  if (value === 'ongoing' || value === 'completed') return value;
  return 'all';
}

function parseLength(value: string | null): DiscoveryLengthFilter {
  if (value === 'short' || value === 'medium' || value === 'long') return value;
  return 'all';
}

function parseCategory(value: string | null): DiscoveryCategoryFilter {
  const next = (value || 'all').trim();
  return next.length > 0 ? next : 'all';
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

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: isLoadingAuth, signInWithFacebook, signInWithGoogle, signOut } = useAuth();
  const { trackEvent } = useTracking({ autoPageView: true, pagePath: '/' });

  const [authError, setAuthError] = useState<string | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Profile Settings State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile>({ pen_name: 'Flow Writer', bio: '', avatar_url: null });
  const [editProfile, setEditProfile] = useState<UserProfile>({ pen_name: '', bio: '', avatar_url: null });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const urlFilters = useMemo(() => {
    const q = (searchParams.get('q') || '').trim();
    const category = parseCategory(searchParams.get('category'));
    const completion = parseCompletion(searchParams.get('completion'));
    const length = parseLength(searchParams.get('length'));

    return {
      q,
      category,
      completion,
      length,
      limit: DISCOVERY_LIMIT,
    };
  }, [searchParams]);

  const [searchInput, setSearchInput] = useState(urlFilters.q);
  const [rails, setRails] = useState<HomeRailsState>(() => createInitialRails(true));
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const buildDiscoveryUrl = useCallback(
    (next: {
      q: string;
      category: DiscoveryCategoryFilter;
      completion: DiscoveryCompletionFilter;
      length: DiscoveryLengthFilter;
    }) => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmedQ = next.q.trim();

      if (trimmedQ) params.set('q', trimmedQ);
      else params.delete('q');

      if (next.category !== 'all') params.set('category', next.category);
      else params.delete('category');

      if (next.completion !== 'all') params.set('completion', next.completion);
      else params.delete('completion');

      if (next.length !== 'all') params.set('length', next.length);
      else params.delete('length');

      params.delete('limit');

      const query = params.toString();
      return query ? `/?${query}` : '/';
    },
    [searchParams]
  );

  const navigateWithFilters = useCallback(
    (next: {
      q: string;
      category: DiscoveryCategoryFilter;
      completion: DiscoveryCompletionFilter;
      length: DiscoveryLengthFilter;
    }) => {
      const url = buildDiscoveryUrl(next);
      router.replace(url, { scroll: false });
    },
    [buildDiscoveryUrl, router]
  );

  useEffect(() => {
    setSearchInput(urlFilters.q);
  }, [urlFilters.q]);

  useEffect(() => {
    const normalizedInput = searchInput.trim();
    if (normalizedInput === urlFilters.q) return;

    const timer = window.setTimeout(() => {
      navigateWithFilters({
        q: normalizedInput,
        category: urlFilters.category,
        completion: urlFilters.completion,
        length: urlFilters.length,
      });

      trackEvent('page_view', '/', {
        metadata: {
          search_query: normalizedInput || undefined,
          category_filter: urlFilters.category,
          completion_filter: urlFilters.completion,
          length_filter: urlFilters.length,
        },
      });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchInput, urlFilters, navigateWithFilters, trackEvent]);

  const apiQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (urlFilters.q) params.set('q', urlFilters.q);
    if (urlFilters.category !== 'all') params.set('category', urlFilters.category);
    if (urlFilters.completion !== 'all') params.set('completion', urlFilters.completion);
    if (urlFilters.length !== 'all') params.set('length', urlFilters.length);
    params.set('limit', String(urlFilters.limit));
    return params.toString();
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
      } else {
        setRails((prev) => ({
          new: { ...prev.new, loading: true },
          popular: { ...prev.popular, loading: true },
          trending: { ...prev.trending, loading: true },
        }));
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
          setRails((prev) => ({
            new: { ...prev.new, loading: false },
            popular: { ...prev.popular, loading: false },
            trending: { ...prev.trending, loading: false },
          }));
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
  }, [apiQuery, cacheKey]);

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
    if (!user) {
      setUnreadNotifCount(0);
      return;
    }
    const fetchUnread = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      setUnreadNotifCount(count || 0);
    };
    fetchUnread();
  }, [user]);

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

  const handleSelectCategory = (category: DiscoveryCategoryFilter) => {
    navigateWithFilters({
      q: urlFilters.q,
      category,
      completion: urlFilters.completion,
      length: urlFilters.length,
    });

    trackEvent('page_view', '/', {
      metadata: {
        search_query: urlFilters.q || undefined,
        category_filter: category,
        completion_filter: urlFilters.completion,
        length_filter: urlFilters.length,
      },
    });
  };

  const handleSelectCompletion = (completion: DiscoveryCompletionFilter) => {
    navigateWithFilters({
      q: urlFilters.q,
      category: urlFilters.category,
      completion,
      length: urlFilters.length,
    });

    trackEvent('page_view', '/', {
      metadata: {
        search_query: urlFilters.q || undefined,
        category_filter: urlFilters.category,
        completion_filter: completion,
        length_filter: urlFilters.length,
      },
    });
  };

  const handleSelectLength = (length: DiscoveryLengthFilter) => {
    navigateWithFilters({
      q: urlFilters.q,
      category: urlFilters.category,
      completion: urlFilters.completion,
      length,
    });

    trackEvent('page_view', '/', {
      metadata: {
        search_query: urlFilters.q || undefined,
        category_filter: urlFilters.category,
        completion_filter: urlFilters.completion,
        length_filter: length,
      },
    });
  };

  const getStoryTags = (story: DiscoveryStory): string[] => {
    const primaryTag =
      story.category === 'fanfic' ? 'แฟนฟิค' : story.category === 'cartoon' ? 'การ์ตูน' : 'ออริจินัล';

    const mainCategoryTag = story.main_category
      ? MAIN_CATEGORIES.find((category) => category.id === story.main_category)?.label || story.main_category
      : null;

    return [primaryTag, ...(mainCategoryTag ? [mainCategoryTag] : [])];
  };

  const selectedCategoryLabel = useMemo(() => {
    if (urlFilters.category === 'all') return null;
    return MAIN_CATEGORIES.find((item) => item.id === urlFilters.category)?.label || urlFilters.category;
  }, [urlFilters.category]);

  const activeFilterPills = useMemo(() => {
    const pills: Array<{ id: string; label: string }> = [];

    if (urlFilters.q) pills.push({ id: 'q', label: `ค้นหา: "${urlFilters.q}"` });
    if (selectedCategoryLabel) pills.push({ id: 'category', label: `หมวด: ${selectedCategoryLabel}` });
    if (urlFilters.completion !== 'all') {
      const completionLabel =
        COMPLETION_FILTERS.find((item) => item.id === urlFilters.completion)?.label || urlFilters.completion;
      pills.push({ id: 'completion', label: `สถานะ: ${completionLabel}` });
    }
    if (urlFilters.length !== 'all') {
      const lengthLabel = LENGTH_FILTERS.find((item) => item.id === urlFilters.length)?.label || urlFilters.length;
      pills.push({ id: 'length', label: `ความยาว: ${lengthLabel}` });
    }

    return pills;
  }, [urlFilters.q, urlFilters.completion, urlFilters.length, selectedCategoryLabel]);

  const hasActiveFilters = activeFilterPills.length > 0;

  const handleResetFilters = () => {
    setSearchInput('');
    navigateWithFilters({
      q: '',
      category: 'all',
      completion: 'all',
      length: 'all',
    });

    trackEvent('page_view', '/', {
      metadata: {
        search_query: undefined,
        category_filter: 'all',
        completion_filter: 'all',
        length_filter: 'all',
      },
    });
  };

  return (
    <main className={styles.main}>
      {/* Top Navbar */}
      <nav className={styles.navbar}>
        <div className={styles.navLeft}>
          <div className={styles.logo}>FlowFic</div>
          <div className={styles.navLinks}>
            <Link href="/" className={styles.activeLink}>
              นิยาย
            </Link>
            <Link href="/">แฟนฟิค</Link>
            <Link href="/">การ์ตูน</Link>
          </div>
        </div>
        <div className={styles.navRight}>
          <button
            className={styles.iconBtn}
            onClick={() => searchInputRef.current?.focus()}
            aria-label="ค้นหาเรื่อง"
            type="button"
          >
            <Search size={18} />
          </button>
          <Link href="/pricing" className={styles.pricingLink}>
            แพ็กเกจ
          </Link>
          <Link href="/dashboard" className={styles.dashboardLink}>
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

                  <Link href="/dashboard" className={styles.profileDropdownItem} onClick={() => setIsProfileMenuOpen(false)}>
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
        {authError && (
          <div className={styles.emptyMyNovels} style={{ color: '#b00020' }}>
            Login error: {authError}
          </div>
        )}

        <section className={`${styles.section} ${styles.discoveryPanel}`}>
          <div className={styles.discoveryHead}>
            <div className={styles.discoveryTitleWrap}>
              <p className={styles.discoveryEyebrow}>
                <SlidersHorizontal size={14} />
                Discovery
              </p>
              <h2 className={styles.discoveryTitle}>ค้นหาเรื่องได้แม่นขึ้นและเร็วขึ้น</h2>
              <p className={styles.discoverySubtitle}>
                กรองตามหมวด, สถานะการจบ, และความยาว พร้อมแชร์ URL ให้คนอื่นดูผลเดียวกันได้
              </p>
            </div>
            <div className={styles.discoveryMeta}>อัปเดต: {formatGeneratedAt(generatedAt) || '-'}</div>
          </div>

          <div className={styles.searchInputWrap}>
            <Search size={16} className={styles.searchInputIcon} />
            <input
              ref={searchInputRef}
              className={styles.searchInput}
              placeholder="ค้นหาเรื่อง, คำโปรย, หรือนามปากกา"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>

          <div className={styles.filterGroup}>
            <div className={styles.filterGroupLabel}>หมวดหมู่หลัก</div>
            <div className={styles.categoryFilters}>
              <button
                className={`${styles.filterBtn} ${urlFilters.category === 'all' ? styles.activeFilter : ''}`}
                onClick={() => handleSelectCategory('all')}
                type="button"
              >
                ทั้งหมด
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
                  {railState.items.map((story) => (
                    <CompactStoryCard
                      key={`${railConfig.key}-${story.id}`}
                      href={`/story/${story.id}`}
                      coverUrl={story.cover_url || ''}
                      title={story.title}
                      author={story.pen_name}
                      tags={getStoryTags(story)}
                      isCompleted={story.completion_status === 'completed'}
                    />
                  ))}
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
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<main className={styles.main} />}>
      <HomePageContent />
    </Suspense>
  );
}
