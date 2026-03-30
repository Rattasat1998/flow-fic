'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import styles from './earnings.module.css';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { SharedNavbar } from '@/components/navigation/SharedNavbar';
import { WriterEarningsPanel } from '@/components/profile/WriterEarningsPanel';

export default function DashboardEarningsPage() {
  const router = useRouter();
  const { user, isLoading: isLoadingAuth, signOut } = useAuth();
  const userId = user?.id ?? null;

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [walletCoinBalance, setWalletCoinBalance] = useState<number | null>(null);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  useEffect(() => {
    if (isLoadingAuth) return;
    if (!userId) {
      router.push('/');
    }
  }, [isLoadingAuth, userId, router]);

  useEffect(() => {
    if (!userId) return;

    const fetchWallet = async () => {
      const { data } = await supabase
        .from('wallets')
        .select('coin_balance')
        .eq('user_id', userId)
        .maybeSingle();

      setWalletCoinBalance(typeof data?.coin_balance === 'number' ? data.coin_balance : 0);
    };

    void fetchWallet();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

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

  const handleDashboardAccess = useCallback((event: ReactMouseEvent<HTMLAnchorElement>) => {
    setIsProfileMenuOpen(false);
    if (typeof window !== 'undefined' && window.location.pathname === '/dashboard') {
      event.preventDefault();
    }
  }, []);

  const handleOpenLogin = useCallback(() => {
    router.push(`/login?next=${encodeURIComponent('/dashboard/earnings')}`);
  }, [router]);

  const handleSignOut = useCallback(async () => {
    try {
      setIsProfileMenuOpen(false);
      await signOut();
      router.push('/');
    } catch (error) {
      console.error('[DashboardEarnings] Sign out failed:', error);
      alert('ออกจากระบบไม่สำเร็จ กรุณาลองใหม่');
    }
  }, [router, signOut]);

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
          <header className={styles.header}>
            <Link href="/dashboard" className={styles.backLink}>
              <ArrowLeft size={14} />
              กลับหน้าแดชบอร์ด
            </Link>
            <h1>รายได้นักเขียน</h1>
          </header>

          {isLoadingAuth ? (
            <section className={styles.loadingState}>กำลังโหลดข้อมูลรายได้...</section>
          ) : (
            <WriterEarningsPanel userId={userId} />
          )}
        </div>
      </div>
    </main>
  );
}
