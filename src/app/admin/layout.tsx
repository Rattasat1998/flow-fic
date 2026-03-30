'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  CreditCard,
  Coins,
  Users,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Bell,
  Search
} from 'lucide-react';
import styles from './layout.module.css';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const pathname = usePathname();

  const menuItems = [
    { icon: BarChart3, label: 'KPI ผู้บริหาร', href: '/admin/kpi' },
    { icon: CreditCard, label: 'การเงิน', href: '/admin/payments' },
    { icon: Coins, label: 'เติม Coin', href: '/admin/coin-topup' },
    { icon: Users, label: 'ผู้ใช้', href: '/admin/users' },
  ];

  return (
    <div className={styles.adminWrapper}>
      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${isSidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
        <div className={styles.sidebarLogo}>
          <div className={styles.logoIcon}>
            <ShieldCheck size={20} color="white" />
          </div>
          {!isSidebarCollapsed && (
            <span className={styles.logoText}>
              Flow<span className={styles.logoAccent}>Admin</span>
            </span>
          )}
        </div>

        <nav className={styles.nav}>
          {menuItems.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
              >
                <item.icon size={20} />
                {!isSidebarCollapsed && <span className={styles.navLabel}>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className={styles.collapseButton}
          >
            {isSidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className={styles.main}>
        {/* Top Navbar */}
        <header className={styles.topNavbar}>
          <div className={styles.searchBar}>
            <Search size={16} color="#64748b" />
            <input
              type="text"
              placeholder="ค้นหาในระบบแอดมิน..."
              className={styles.searchInput}
            />
          </div>

          <div className={styles.navActions}>
            <button className={styles.notificationBtn}>
              <Bell size={20} />
              <span className={styles.notificationDot}></span>
            </button>
            <div className={styles.divider}></div>
            <div className={styles.userProfile}>
              <div className={styles.userName}>
                <p>ผู้ดูแลระบบ</p>
                <p>ผู้จัดการฝ่ายการเงิน</p>
              </div>
              <div className={styles.avatar}></div>
            </div>
          </div>
        </header>

        <main className={styles.contentBody}>
          {children}
        </main>
      </div>
    </div>
  );
}
