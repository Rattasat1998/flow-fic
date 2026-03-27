'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, RefreshCcw, ShieldAlert, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import styles from './kpi.module.css';

type RangeOption = 'today' | '7d' | '30d' | '90d';

type KpiResponse = {
  success: boolean;
  range: RangeOption;
  since: string;
  generatedAt: string;
  cards: {
    topupCoins: number;
    unlockCoins: number;
    netCoins: number;
    activeVipNow: number;
    uniqueUsers: number;
    uniqueSessions: number;
    publishedStories: number;
    openPaymentCases: number;
  };
  eventBreakdown: Array<{
    eventType: string;
    count: number;
  }>;
  funnel: Array<{
    step: string;
    count: number;
  }>;
  topStories: Array<{
    storyId: string;
    storyTitle: string;
    count: number;
  }>;
  recentPaymentCases: Array<{
    id: string;
    caseType: string;
    status: string;
    userId: string;
    amount: number;
    currency: string;
    createdAt: string;
  }>;
  error?: string;
};

const RANGE_OPTIONS: Array<{ value: RangeOption; label: string }> = [
  { value: 'today', label: 'วันนี้' },
  { value: '7d', label: '7 วัน' },
  { value: '30d', label: '30 วัน' },
  { value: '90d', label: '90 วัน' },
];

const EVENT_LABELS: Record<string, string> = {
  page_view: 'เข้าหน้า',
  story_view: 'ดูเรื่อง',
  chapter_read: 'อ่านตอน',
  choice_select: 'เลือกเส้นทาง',
  pricing_view: 'ดูราคา',
  chapter_unlock: 'ปลดล็อกตอน',
  like: 'กดถูกใจ',
  favorite: 'เพิ่มรายการโปรด',
  comment: 'คอมเมนต์',
  web_vitals: 'คุณภาพหน้าเว็บ',
};

const FUNNEL_LABELS: Record<string, string> = {
  page_view: 'เข้าหน้า',
  story_view: 'ดูเรื่อง',
  chapter_read: 'อ่านตอน',
  choice_select: 'เลือกเส้นทาง',
  pricing_view: 'ดูราคา',
  chapter_unlock: 'ปลดล็อกตอน',
};

const CASE_TYPE_LABELS: Record<string, string> = {
  refund: 'คืนเงิน',
  refund_request: 'คำขอคืนเงิน',
  chargeback: 'เรียกเก็บเงินคืน',
  payment_dispute: 'ข้อโต้แย้งการชำระเงิน',
  manual_review: 'ตรวจสอบโดยทีม',
};

const CASE_STATUS_LABELS: Record<string, string> = {
  open: 'เปิดเคส',
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธ',
  resolved: 'ปิดเคสแล้ว',
  canceled: 'ยกเลิก',
  on_hold: 'ระงับชั่วคราว',
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatCardNumber(value: number) {
  return value.toLocaleString('th-TH');
}

function formatCaseAmount(amount: number, currency: string) {
  if (currency === 'THB') {
    return `฿${(amount / 100).toLocaleString('th-TH')}`;
  }
  return amount.toLocaleString('th-TH');
}

export default function AdminKpiClient() {
  const [range, setRange] = useState<RangeOption>('30d');
  const [data, setData] = useState<KpiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allowed, setAllowed] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchKpi = useCallback(async (selectedRange: RangeOption, isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setAllowed(false);
        setData(null);
        return;
      }

      const response = await fetch(`/api/admin/kpi?range=${selectedRange}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = (await response.json()) as KpiResponse;

      if (response.status === 401 || response.status === 403) {
        setAllowed(false);
        setData(null);
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error || 'ไม่สามารถโหลดข้อมูล KPI ได้');
      }

      setAllowed(true);
      setData(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchKpi(range, false);
  }, [range, fetchKpi]);

  const maxEventCount = useMemo(() => {
    if (!data?.eventBreakdown?.length) return 1;
    return Math.max(...data.eventBreakdown.map((item) => item.count), 1);
  }, [data]);

  if (loading && !data) {
    return (
      <section className={styles.stateContainer}>
        <RefreshCcw className={styles.spin} />
        <p>กำลังโหลดข้อมูล KPI ผู้บริหาร...</p>
      </section>
    );
  }

  if (!allowed) {
    return (
      <section className={styles.stateContainer}>
        <ShieldAlert size={42} />
        <h1>คุณไม่มีสิทธิ์เข้าถึงหน้านี้</h1>
        <p>กรุณาตรวจสอบ `FINANCE_ADMIN_USER_IDS` ในไฟล์ `.env.local`</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className={styles.stateContainer}>
        <p>ไม่พบข้อมูล KPI</p>
      </section>
    );
  }

  const firstFunnelValue = data.funnel[0]?.count || 0;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>
            <BarChart3 size={22} />
            KPI ผู้บริหาร
          </h1>
          <p>สรุปภาพรวมการเงิน ผู้ใช้ และคอนเทนต์ สำหรับการตัดสินใจระดับผู้บริหาร</p>
        </div>

        <div className={styles.actions}>
          <div className={styles.rangeGroup}>
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`${styles.rangeButton} ${range === option.value ? styles.rangeButtonActive : ''}`}
                onClick={() => setRange(option.value)}
                disabled={loading || refreshing}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => void fetchKpi(range, true)}
            disabled={refreshing}
          >
            <RefreshCcw size={16} className={refreshing ? styles.spin : ''} />
            {refreshing ? 'กำลังรีเฟรช...' : 'รีเฟรช'}
          </button>
        </div>
      </header>

      {error ? <p className={styles.errorBanner}>{error}</p> : null}

      <section className={styles.metaRow}>
        <span>ช่วงเวลา: {RANGE_OPTIONS.find((item) => item.value === data.range)?.label || data.range}</span>
        <span>อัปเดตล่าสุด: {formatDateTime(data.generatedAt)}</span>
      </section>

      <section className={styles.cardGrid}>
        <article className={styles.card}>
          <p className={styles.cardLabel}>เหรียญที่เติมเข้า</p>
          <p className={styles.cardValue}>{formatCardNumber(data.cards.topupCoins)}</p>
          <p className={styles.cardHint}>เหรียญ</p>
        </article>
        <article className={styles.card}>
          <p className={styles.cardLabel}>เหรียญที่ใช้ปลดล็อก</p>
          <p className={styles.cardValue}>{formatCardNumber(data.cards.unlockCoins)}</p>
          <p className={styles.cardHint}>เหรียญ</p>
        </article>
        <article className={styles.card}>
          <p className={styles.cardLabel}>ยอดเหรียญสุทธิ</p>
          <p className={styles.cardValue}>{formatCardNumber(data.cards.netCoins)}</p>
          <p className={styles.cardHint}>เหรียญ</p>
        </article>
        <article className={styles.card}>
          <p className={styles.cardLabel}>สมาชิก VIP ที่ใช้งาน</p>
          <p className={styles.cardValue}>{formatCardNumber(data.cards.activeVipNow)}</p>
          <p className={styles.cardHint}>บัญชี</p>
        </article>
        <article className={styles.card}>
          <p className={styles.cardLabel}>ผู้ใช้ที่ใช้งาน</p>
          <p className={styles.cardValue}>{formatCardNumber(data.cards.uniqueUsers)}</p>
          <p className={styles.cardHint}>บัญชี (unique)</p>
        </article>
        <article className={styles.card}>
          <p className={styles.cardLabel}>เซสชันทั้งหมด</p>
          <p className={styles.cardValue}>{formatCardNumber(data.cards.uniqueSessions)}</p>
          <p className={styles.cardHint}>เซสชัน</p>
        </article>
        <article className={styles.card}>
          <p className={styles.cardLabel}>เรื่องที่เผยแพร่ใหม่</p>
          <p className={styles.cardValue}>{formatCardNumber(data.cards.publishedStories)}</p>
          <p className={styles.cardHint}>เรื่อง</p>
        </article>
        <article className={styles.card}>
          <p className={styles.cardLabel}>เคสการเงินที่เปิดอยู่</p>
          <p className={styles.cardValue}>{formatCardNumber(data.cards.openPaymentCases)}</p>
          <p className={styles.cardHint}>เคส</p>
        </article>
      </section>

      <section className={styles.gridTwo}>
        <article className={styles.panel}>
          <h2>
            <Activity size={16} />
            Event Breakdown
          </h2>
          <div className={styles.breakdownList}>
            {data.eventBreakdown.length === 0 ? (
              <p className={styles.emptyState}>ยังไม่มีข้อมูลกิจกรรมในช่วงเวลานี้</p>
            ) : (
              data.eventBreakdown.map((item) => (
                <div key={item.eventType} className={styles.breakdownRow}>
                  <span className={styles.breakdownLabel}>{EVENT_LABELS[item.eventType] || item.eventType}</span>
                  <div className={styles.breakdownTrack}>
                    <div
                      className={styles.breakdownFill}
                      style={{ width: `${Math.max((item.count / maxEventCount) * 100, 3)}%` }}
                    >
                      {item.count.toLocaleString('th-TH')}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className={styles.panel}>
          <h2>
            <TrendingUp size={16} />
            Funnel ผู้ใช้
          </h2>
          <div className={styles.funnelList}>
            {data.funnel.map((item) => {
              const rate = firstFunnelValue > 0 ? (item.count / firstFunnelValue) * 100 : 0;
              return (
                <div key={item.step} className={styles.funnelRow}>
                  <span>{FUNNEL_LABELS[item.step] || item.step}</span>
                  <span>{item.count.toLocaleString('th-TH')}</span>
                  <span>{rate.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className={styles.gridTwo}>
        <article className={styles.panel}>
          <h2>Top Stories</h2>
          <div className={styles.storyList}>
            {data.topStories.length === 0 ? (
              <p className={styles.emptyState}>ยังไม่มีข้อมูลเรื่องยอดนิยม</p>
            ) : (
              data.topStories.map((item, index) => (
                <div key={item.storyId} className={styles.storyRow}>
                  <span className={styles.storyRank}>{index + 1}</span>
                  <span className={styles.storyTitle}>{item.storyTitle}</span>
                  <span className={styles.storyCount}>{item.count.toLocaleString('th-TH')}</span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className={styles.panel}>
          <h2>เคสการเงินล่าสุด</h2>
          <div className={styles.caseTableWrap}>
            <table className={styles.caseTable}>
              <thead>
                <tr>
                  <th>รหัสเคส</th>
                  <th>ประเภท</th>
                  <th>สถานะ</th>
                  <th>จำนวน</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPaymentCases.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={styles.emptyCell}>ยังไม่มีเคสล่าสุด</td>
                  </tr>
                ) : (
                  data.recentPaymentCases.map((item) => (
                    <tr key={item.id}>
                      <td className={styles.mono}>#{item.id.slice(0, 8)}</td>
                      <td>{CASE_TYPE_LABELS[item.caseType] || item.caseType}</td>
                      <td>{CASE_STATUS_LABELS[item.status] || item.status}</td>
                      <td>{formatCaseAmount(item.amount, item.currency)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
}

