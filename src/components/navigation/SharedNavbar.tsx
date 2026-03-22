'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent, type ReactNode, type RefObject } from 'react';
import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import {
  X,
  Bell,
  BookOpen,
  Coins,
  Heart,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
} from 'lucide-react';

import styles from '@/app/home.module.css';

type SharedNavbarProps = {
  navRef?: RefObject<HTMLElement | null>;
  navDataGsap?: string;
  user: User | null;
  isLoadingAuth: boolean;
  coinBalance: number | null;
  unreadNotifCount: number;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onSearchSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  showSearchShortcutHint?: boolean;
  searchPanel?: ReactNode;
  onDashboardAccess: (event: MouseEvent<HTMLAnchorElement>) => void;
  isProfileMenuOpen: boolean;
  profileMenuRef: RefObject<HTMLDivElement | null>;
  onToggleProfileMenu: () => void;
  onCloseProfileMenu: () => void;
  onOpenLogin: () => void;
  onSignOut: () => void | Promise<void>;
  lovesLabel?: string;
  profileExtraAction?: ReactNode;
};

export function SharedNavbar({
  navRef,
  navDataGsap,
  user,
  isLoadingAuth,
  coinBalance,
  unreadNotifCount,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  searchInputRef,
  searchPlaceholder = 'ค้นหาเรื่องที่อยากอ่าน',
  searchAriaLabel = 'ค้นหาเรื่อง',
  showSearchShortcutHint = true,
  searchPanel,
  onDashboardAccess,
  isProfileMenuOpen,
  profileMenuRef,
  onToggleProfileMenu,
  onCloseProfileMenu,
  onOpenLogin,
  onSignOut,
  lovesLabel = 'เรื่องที่ชอบ',
  profileExtraAction,
}: SharedNavbarProps) {
  const pathname = usePathname();
  const hasSearch = Boolean(onSearchSubmit && onSearchChange);
  const hasSearchPanel = hasSearch && Boolean(searchPanel);
  const [mobileDrawerRoute, setMobileDrawerRoute] = useState<string | null>(null);
  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false);
  const [searchPanelPathname, setSearchPanelPathname] = useState<string | null>(null);
  const isMobileDrawerOpen = mobileDrawerRoute === pathname;
  const isSearchPanelVisible = hasSearchPanel && isSearchPanelOpen && searchPanelPathname === pathname;
  const searchShellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMobileDrawerOpen) return;

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileDrawerRoute(null);
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isMobileDrawerOpen]);

  useEffect(() => {
    if (isMobileDrawerOpen) {
      document.body.classList.add('ffMobileDrawerOpen');
    } else {
      document.body.classList.remove('ffMobileDrawerOpen');
    }

    return () => {
      document.body.classList.remove('ffMobileDrawerOpen');
    };
  }, [isMobileDrawerOpen]);

  const closeSearchPanel = useCallback(() => {
    setIsSearchPanelOpen(false);
    setSearchPanelPathname(null);
  }, []);

  useEffect(() => {
    if (!isSearchPanelVisible) return;

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSearchPanel();
      }
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (searchShellRef.current?.contains(target)) return;
      closeSearchPanel();
    };

    document.addEventListener('keydown', handleEsc);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [closeSearchPanel, isSearchPanelVisible]);

  const closeMobileDrawer = () => {
    setMobileDrawerRoute(null);
  };

  const handleSearchFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    closeSearchPanel();
    onSearchSubmit?.(event);
  };

  const handleDashboardLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onDashboardAccess(event);
    closeMobileDrawer();
  };

  const mobileDrawerNode = isMobileDrawerOpen ? (
    <div className={styles.mobileDrawerOverlay} onClick={closeMobileDrawer}>
      <aside
        className={styles.mobileDrawerPanel}
        onClick={(event) => event.stopPropagation()}
        aria-label="เมนูมือถือ"
      >
        <div className={styles.mobileDrawerHeader}>
          <Link href="/" className={styles.mobileDrawerBrand} onClick={closeMobileDrawer}>
            FlowFic
          </Link>
          <button
            type="button"
            className={styles.mobileDrawerCloseBtn}
            aria-label="ปิดเมนูมือถือ"
            onClick={closeMobileDrawer}
          >
            <X size={20} />
          </button>
        </div>

        <div className={styles.mobileDrawerSection}>
          <Link href="/" className={styles.mobileDrawerLink} onClick={closeMobileDrawer}>
            หน้าแรก
          </Link>
          <Link href="/pricing" className={styles.mobileDrawerLink} onClick={closeMobileDrawer}>
            แพ็กเกจ
          </Link>
          <Link href="/dashboard" className={styles.mobileDrawerLink} onClick={handleDashboardLinkClick}>
            แดชบอร์ดนักเขียน
          </Link>

          {user && (
            <>
              <Link href="/bookshelf" className={styles.mobileDrawerLink} onClick={closeMobileDrawer}>
                ชั้นหนังสือ
              </Link>
              <Link href="/loves" className={styles.mobileDrawerLink} onClick={closeMobileDrawer}>
                {lovesLabel}
              </Link>
              <Link href="/notifications" className={styles.mobileDrawerLink} onClick={closeMobileDrawer}>
                การแจ้งเตือน
              </Link>
            </>
          )}
        </div>

        <div className={styles.mobileDrawerDivider} />

        <div className={styles.mobileDrawerFooter}>
          {user ? (
            <>
              <p className={styles.mobileDrawerMeta}>
                {user.user_metadata?.full_name || user.email?.split('@')[0] || 'ผู้ใช้งาน'}
              </p>
              <button
                type="button"
                className={styles.mobileDrawerSignOutBtn}
                onClick={() => {
                  closeMobileDrawer();
                  void onSignOut();
                }}
              >
                ออกจากระบบ
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.mobileDrawerLoginBtn}
              onClick={() => {
                closeMobileDrawer();
                onOpenLogin();
              }}
            >
              เข้าสู่ระบบ
            </button>
          )}
        </div>
      </aside>
    </div>
  ) : null;

  return (
    <nav
      className={`${styles.navbar} ${!hasSearch ? styles.navbarNoSearch : ''}`}
      ref={navRef}
      data-gsap={navDataGsap}
    >
      <div className={styles.navLeft}>
        <Link href="/" className={styles.logo}>
          FlowFic
        </Link>
      </div>

      {hasSearch && onSearchSubmit && onSearchChange && (
        <div className={styles.navSearchShell} ref={searchShellRef}>
          <form className={styles.navSearchWrap} onSubmit={handleSearchFormSubmit}>
            <Search size={16} className={styles.navSearchIcon} />
            <input
              ref={searchInputRef}
              className={styles.navSearchInput}
              placeholder={searchPlaceholder}
              value={searchValue ?? ''}
              onChange={(event) => onSearchChange(event.target.value)}
              onFocus={() => {
                if (hasSearchPanel) {
                  setIsSearchPanelOpen(true);
                  setSearchPanelPathname(pathname);
                }
              }}
              aria-label={searchAriaLabel}
            />
            {showSearchShortcutHint && <span className={styles.navSearchHint}>⌘K</span>}
          </form>

          {isSearchPanelVisible && (
            <div className={styles.navSearchPanel}>
              {searchPanel}
            </div>
          )}
        </div>
      )}

      <div className={styles.navRight}>
        {user ? (
          <Link href="/pricing" prefetch={false} className={styles.coinBalancePill}>
            <Coins size={15} />
            <span>{coinBalance === null ? '...' : `${coinBalance.toLocaleString('th-TH')} เหรียญ`}</span>
          </Link>
        ) : (
          <Link href="/pricing" prefetch={false} className={styles.pricingLink}>
            แพ็กเกจ
          </Link>
        )}

        {user && (
          <Link href="/dashboard" className={styles.dashboardLink} onClick={onDashboardAccess}>
            แดชบอร์ดนักเขียน
          </Link>
        )}

        {user && (
          <Link href="/notifications" className={styles.notifBellBtn} aria-label="การแจ้งเตือน">
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
            <button
              type="button"
              className={styles.profileAvatarBtn}
              aria-label="เมนูผู้ใช้"
              onClick={onToggleProfileMenu}
            >
              {user.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url} alt="" className={styles.userAvatar} />
              ) : (
                <div className={styles.userAvatarPlaceholder}>
                  {(user.email?.charAt(0) || 'U').toUpperCase()}
                </div>
              )}
            </button>

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

                <Link href="/dashboard" className={styles.profileDropdownItem} onClick={onDashboardAccess}>
                  <LayoutDashboard size={16} /> แดชบอร์ดนักเขียน
                </Link>
                <Link
                  href="/bookshelf"
                  className={styles.profileDropdownItem}
                  onClick={() => {
                    onCloseProfileMenu();
                  }}
                >
                  <BookOpen size={16} /> ชั้นหนังสือ
                </Link>
                <Link
                  href="/loves"
                  className={styles.profileDropdownItem}
                  onClick={() => {
                    onCloseProfileMenu();
                  }}
                >
                  <Heart size={16} /> {lovesLabel}
                </Link>
                <Link
                  href="/notifications"
                  className={styles.profileDropdownItem}
                  onClick={() => {
                    onCloseProfileMenu();
                  }}
                >
                  <Bell size={16} /> การแจ้งเตือน
                </Link>

                {profileExtraAction}

                <div className={styles.profileDropdownDivider} />

                <button
                  type="button"
                  className={`${styles.profileDropdownItem} ${styles.profileDropdownLogout}`}
                  onClick={() => void onSignOut()}
                >
                  <LogOut size={16} /> ออกจากระบบ
                </button>
              </div>
            )}
          </div>
        ) : (
          <button type="button" className={styles.navLoginBtn} onClick={onOpenLogin}>
            เข้าสู่ระบบ
          </button>
        )}

        <button
          className={styles.mobileMenuBtn}
          type="button"
          aria-label="เปิดเมนู"
          aria-expanded={isMobileDrawerOpen}
          onClick={() => setMobileDrawerRoute(pathname)}
        >
          <Menu size={22} />
        </button>
      </div>

      {mobileDrawerNode && createPortal(mobileDrawerNode, document.body)}
    </nav>
  );
}
