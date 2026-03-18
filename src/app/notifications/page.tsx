'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import styles from './notifications.module.css';

interface Notification {
    id: string;
    type: string;
    title: string;
    body: string | null;
    link: string | null;
    metadata: Record<string, unknown>;
    is_read: boolean;
    created_at: string;
}

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'เมื่อสักครู่';
    if (mins < 60) return `${mins} นาทีที่แล้ว`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} วันที่แล้ว`;
    return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

export default function NotificationsPage() {
    const { user, isLoading: isAuthLoading } = useAuth();
    const userId = user?.id ?? null;
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    const getAccessToken = useCallback(async () => {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
            console.error('[Notifications] Session error:', error);
            return null;
        }
        return data.session?.access_token || null;
    }, []);

    const fetchNotifications = useCallback(async () => {
        const accessToken = await getAccessToken();
        if (!accessToken) return;
        setIsLoading(true);
        try {
            const res = await fetch('/api/notifications?limit=50', {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();
            setNotifications(data.notifications || []);
            setUnreadCount(data.unreadCount || 0);
        } catch (err) {
            console.error('[Notifications] Fetch error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [getAccessToken]);

    useEffect(() => {
        if (!isAuthLoading && userId) void fetchNotifications();
        else if (!isAuthLoading && !userId) setIsLoading(false);
    }, [isAuthLoading, userId, fetchNotifications]);

    const markAsRead = async (id: string) => {
        const accessToken = await getAccessToken();
        if (!accessToken) return;

        // Optimistic update
        setNotifications(prev =>
            prev.map(n => (n.id === id ? { ...n, is_read: true } : n))
        );
        setUnreadCount(prev => Math.max(0, prev - 1));

        try {
            await fetch('/api/notifications', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ notificationId: id }),
            });
        } catch (err) {
            console.error('[Notifications] Mark read error:', err);
        }
    };

    const markAllRead = async () => {
        const accessToken = await getAccessToken();
        if (!accessToken) return;

        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);

        try {
            await fetch('/api/notifications', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ markAll: true }),
            });
        } catch (err) {
            console.error('[Notifications] Mark all read error:', err);
        }
    };

    const handleItemClick = (notif: Notification) => {
        if (!notif.is_read) markAsRead(notif.id);
    };

    if (!isAuthLoading && !user) {
        return (
            <main className={styles.main}>
                <header className={styles.header}>
                    <div className={styles.headerLeft}>
                        <h1 className={styles.title}>
                            <Bell size={20} /> การแจ้งเตือน
                        </h1>
                    </div>
                </header>
                <div className={styles.loginPrompt}>
                    <Bell size={40} />
                    <p>กรุณาเข้าสู่ระบบเพื่อดูการแจ้งเตือน</p>
                    <Link href="/" className={styles.loginBtn}>เข้าสู่ระบบ</Link>
                </div>
            </main>
        );
    }

    return (
        <main className={styles.main}>
            {/* Header */}
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.title}>
                        <Bell size={20} /> การแจ้งเตือน
                        {unreadCount > 0 && (
                            <span style={{ fontSize: '0.8rem', color: '#3b82f6', marginLeft: '0.35rem' }}>
                                ({unreadCount})
                            </span>
                        )}
                    </h1>
                </div>
                {unreadCount > 0 && (
                    <button className={styles.markAllBtn} onClick={markAllRead}>
                        <CheckCheck size={14} /> อ่านแล้วทั้งหมด
                    </button>
                )}
            </header>

            {/* Content */}
            {isLoading ? (
                <div className={styles.loadingState}>
                    <Loader2 size={20} className={styles.spinner} />
                    กำลังโหลดการแจ้งเตือน...
                </div>
            ) : notifications.length === 0 ? (
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>🔔</div>
                    <div className={styles.emptyTitle}>ยังไม่มีการแจ้งเตือน</div>
                    <div className={styles.emptyDesc}>เมื่อคุณติดตามเรื่องและมีตอนใหม่ จะแสดงที่นี่</div>
                </div>
            ) : (
                <div className={styles.list}>
                    {notifications.map((notif) => {
                        const inner = (
                            <>
                                <div className={styles.itemIcon}>
                                    {notif.type === 'new_chapter' ? '📖' : '🔔'}
                                </div>
                                <div className={styles.itemBody}>
                                    <div className={styles.itemTitle}>{notif.title}</div>
                                    {notif.body && <div className={styles.itemDesc}>{notif.body}</div>}
                                    <div className={styles.itemTime}>{timeAgo(notif.created_at)}</div>
                                </div>
                            </>
                        );

                        if (notif.link) {
                            return (
                                <Link
                                    key={notif.id}
                                    href={notif.link}
                                    className={`${styles.item} ${!notif.is_read ? styles.itemUnread : ''}`}
                                    onClick={() => handleItemClick(notif)}
                                >
                                    {inner}
                                </Link>
                            );
                        }

                        return (
                            <div
                                key={notif.id}
                                className={`${styles.item} ${!notif.is_read ? styles.itemUnread : ''}`}
                                onClick={() => handleItemClick(notif)}
                            >
                                {inner}
                            </div>
                        );
                    })}
                </div>
            )}
        </main>
    );
}
