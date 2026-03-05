'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { BarChart3, ArrowLeft, RefreshCw, TrendingUp, Users, Activity, Eye, Zap } from 'lucide-react';
import styles from './analytics.module.css';

// ─── Types ──────────────────────────────────────
interface OverviewData {
    today: number;
    last7d: number;
    last30d: number;
    uniqueUsers: number;
    uniqueSessions: number;
}

interface EventBreakdownItem {
    event_type: string;
    event_count: number;
}

interface TopStoryItem {
    story_id: string;
    story_title: string;
    event_count: number;
}

interface RecentEvent {
    id: string;
    event_type: string;
    page_path: string;
    story_id: string | null;
    chapter_id: string | null;
    session_id: string;
    user_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
}

interface FunnelStep {
    step: string;
    count: number;
}

interface AnalyticsData {
    overview: OverviewData;
    eventBreakdown: EventBreakdownItem[];
    topStories: TopStoryItem[];
    recentEvents: RecentEvent[];
    funnel: FunnelStep[];
}

// ─── Helpers ────────────────────────────────────
const EVENT_LABELS: Record<string, string> = {
    page_view: 'หน้าหลัก',
    story_view: 'ดูเรื่อง',
    chapter_read: 'อ่านบท',
    pricing_view: 'หน้าราคา',
    chapter_unlock: 'ปลดล็อก',
    like: 'กดหัวใจ',
    favorite: 'เก็บเข้าชั้น',
    comment: 'คอมเมนต์',
    page_leave: 'ออกจากหน้า',
};

const FUNNEL_LABELS: Record<string, string> = {
    page_view: '🏠 หน้าหลัก',
    story_view: '📖 ดูรายละเอียดเรื่อง',
    chapter_read: '📚 อ่านบท',
    pricing_view: '💰 หน้าราคา',
    chapter_unlock: '🔓 ปลดล็อกบท',
};

const BAR_CLASS: Record<string, string> = {
    page_view: styles.barPage,
    story_view: styles.barStory,
    chapter_read: styles.barChapter,
    pricing_view: styles.barPricing,
    chapter_unlock: styles.barUnlock,
    like: styles.barLike,
    favorite: styles.barFavorite,
    comment: styles.barComment,
};

function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('th-TH', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

// ─── Component ──────────────────────────────────
export default function AnalyticsDashboard() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/analytics');
            if (!res.ok) throw new Error('Failed to load analytics');
            const json = await res.json();
            setData(json);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    if (isLoading) {
        return (
            <main className={styles.main}>
                <div className={styles.loadingState}>
                    <RefreshCw size={20} className={styles.spinIcon} />
                    &nbsp; กำลังโหลดข้อมูล Analytics...
                </div>
            </main>
        );
    }

    if (error || !data) {
        return (
            <main className={styles.main}>
                <div className={styles.errorState}>
                    <p>⚠️ {error || 'ไม่สามารถโหลดข้อมูลได้'}</p>
                    <button className={styles.refreshBtn} onClick={fetchData}>ลองใหม่</button>
                </div>
            </main>
        );
    }

    const maxEventCount = Math.max(...(data.eventBreakdown.map(e => e.event_count)), 1);
    const funnelMax = Math.max(...data.funnel.map(f => f.count), 1);

    return (
        <main className={styles.main}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <Link href="/dashboard" className={styles.backBtn}>
                        <ArrowLeft size={16} /> กลับ
                    </Link>
                    <h1 className={styles.title}>
                        <BarChart3 size={22} style={{ verticalAlign: 'text-bottom' }} /> Analytics Dashboard
                    </h1>
                </div>
                <button className={styles.refreshBtn} onClick={fetchData} disabled={isLoading}>
                    <RefreshCw size={14} className={isLoading ? styles.spinIcon : ''} />
                    รีเฟรช
                </button>
            </div>

            {/* Overview Cards */}
            <div className={styles.overviewGrid}>
                <div className={styles.overviewCard}>
                    <div className={styles.cardLabel}>Events วันนี้</div>
                    <div className={styles.cardValue}>{data.overview.today.toLocaleString()}</div>
                </div>
                <div className={styles.overviewCard}>
                    <div className={styles.cardLabel}>Events 7 วัน</div>
                    <div className={styles.cardValue}>{data.overview.last7d.toLocaleString()}</div>
                </div>
                <div className={styles.overviewCard}>
                    <div className={styles.cardLabel}>Events 30 วัน</div>
                    <div className={styles.cardValue}>{data.overview.last30d.toLocaleString()}</div>
                </div>
                <div className={styles.overviewCard}>
                    <div className={styles.cardLabel}>ผู้ใช้ วันนี้</div>
                    <div className={styles.cardValue}>{data.overview.uniqueUsers.toLocaleString()}</div>
                </div>
                <div className={styles.overviewCard}>
                    <div className={styles.cardLabel}>Sessions วันนี้</div>
                    <div className={styles.cardValue}>{data.overview.uniqueSessions.toLocaleString()}</div>
                </div>
            </div>

            {/* Event Breakdown + Funnel */}
            <div className={styles.grid2}>
                {/* Event Breakdown */}
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                        <Activity size={16} /> Event Breakdown (7 วัน)
                    </h2>
                    <div className={styles.barChart}>
                        {data.eventBreakdown.map((item) => (
                            <div key={item.event_type} className={styles.barRow}>
                                <span className={styles.barLabel}>
                                    {EVENT_LABELS[item.event_type] || item.event_type}
                                </span>
                                <div className={styles.barTrack}>
                                    <div
                                        className={`${styles.barFill} ${BAR_CLASS[item.event_type] || styles.barDefault}`}
                                        style={{ width: `${Math.max((item.event_count / maxEventCount) * 100, 3)}%` }}
                                    >
                                        <span>{item.event_count.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {data.eventBreakdown.length === 0 && (
                            <p style={{ color: '#64748b', textAlign: 'center', padding: '1rem' }}>ยังไม่มี event data</p>
                        )}
                    </div>
                </div>

                {/* User Funnel */}
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                        <TrendingUp size={16} /> User Funnel (7 วัน)
                    </h2>
                    <div className={styles.funnel}>
                        {data.funnel.map((step, i) => {
                            const rate = i === 0 ? 100 : data.funnel[0].count > 0
                                ? ((step.count / data.funnel[0].count) * 100)
                                : 0;
                            return (
                                <div key={step.step} className={styles.funnelStep} style={{ paddingLeft: `${1 + i * 0.5}rem` }}>
                                    <span className={styles.funnelStepName}>
                                        {FUNNEL_LABELS[step.step] || step.step}
                                    </span>
                                    <span className={styles.funnelStepCount}>{step.count.toLocaleString()}</span>
                                    <span className={styles.funnelStepRate}>{rate.toFixed(1)}%</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Top Stories + Recent Events */}
            <div className={styles.grid2}>
                {/* Top Stories */}
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                        <Eye size={16} /> Top Stories (30 วัน)
                    </h2>
                    <div className={styles.storyList}>
                        {data.topStories.map((story, i) => (
                            <div key={story.story_id} className={styles.storyRow}>
                                <span className={styles.storyRank}>{i + 1}</span>
                                <span className={styles.storyName}>{story.story_title}</span>
                                <span className={styles.storyCount}>{story.event_count.toLocaleString()}</span>
                            </div>
                        ))}
                        {data.topStories.length === 0 && (
                            <p style={{ color: '#64748b', textAlign: 'center', padding: '1rem' }}>ยังไม่มีข้อมูลเรื่อง</p>
                        )}
                    </div>
                </div>

                {/* Recent Events */}
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                        <Zap size={16} /> Events ล่าสุด
                    </h2>
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Event</th>
                                    <th>Path</th>
                                    <th>Session</th>
                                    <th>เวลา</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.recentEvents.map((evt) => (
                                    <tr key={evt.id}>
                                        <td>
                                            <span className={styles.eventBadge} data-type={evt.event_type}>
                                                {EVENT_LABELS[evt.event_type] || evt.event_type}
                                            </span>
                                        </td>
                                        <td className={styles.truncate} title={evt.page_path}>{evt.page_path}</td>
                                        <td className={styles.truncate} title={evt.session_id}>
                                            {evt.session_id.replace('sess_', '').slice(0, 8)}
                                        </td>
                                        <td>{formatTime(evt.created_at)}</td>
                                    </tr>
                                ))}
                                {data.recentEvents.length === 0 && (
                                    <tr>
                                        <td colSpan={4} style={{ textAlign: 'center', color: '#64748b', padding: '1rem' }}>ยังไม่มี events</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </main>
    );
}
