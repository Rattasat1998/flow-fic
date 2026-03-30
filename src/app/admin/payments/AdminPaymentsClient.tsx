'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useCookieConsent } from '@/contexts/CookieConsentContext';
import {
  ShieldCheck,
  Search,
  RefreshCcw,
  Coins,
  Wallet,
  History,
  BarChart3,
  Lock,
  Activity,
  Terminal,
  Zap
} from 'lucide-react';
import styles from './payments.module.css';

// --- Types ---
type PaymentCaseStatus = 'open' | 'resolved' | 'rejected' | 'on_hold';
type PaymentCaseType = 'refund_request' | 'chargeback' | 'payment_dispute' | 'manual_review';

interface PaymentCase {
  id: string;
  case_type: PaymentCaseType;
  status: PaymentCaseStatus;
  user_id: string;
  amount: number;
  currency: string;
  reason: string;
  external_reference: string | null;
  source_txn_id: string;
  hold_txn_id: string | null;
  resolution_txn_id: string | null;
  opened_by: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

interface CoinTransaction {
  id: string;
  user_id: string;
  amount: number;
  txn_type: string;
  description: string;
  created_at: string;
  reference_type: string | null;
  reference_id: string | null;
  policy_version: string | null;
  reversal_of_txn_id: string | null;
}

interface AdminLog {
  id: number;
  action: string;
  status: number;
  ok: boolean;
  createdAt: string;
  response: unknown;
}

interface CreatorPayoutRequest {
  id: string;
  writerUserId: string;
  status: 'requested' | 'approved' | 'paid' | 'rejected' | 'canceled';
  grossSatang: number;
  withholdingBps: number;
  withholdingSatang: number;
  netSatang: number;
  promptpayTarget: string | null;
  transferReference: string | null;
  transferProofUrl: string | null;
  requestNote: string | null;
  requestedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  paidAt: string | null;
  paidBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectReason: string | null;
  itemCount: number;
  profile: {
    legalName: string | null;
    kycStatus: string;
    promptpayTarget: string | null;
  } | null;
}

const CASE_STATUS_LABELS: Record<PaymentCaseStatus, string> = {
  open: 'รอดำเนินการ',
  resolved: 'ปิดเคสแล้ว',
  rejected: 'ปฏิเสธคำขอ',
  on_hold: 'ระงับไว้ชั่วคราว',
};

const CASE_STATUS_BADGE_CLASS: Record<
  PaymentCaseStatus,
  'status_pending' | 'status_success' | 'status_failed' | 'status_on_hold'
> = {
  open: 'status_pending',
  resolved: 'status_success',
  rejected: 'status_failed',
  on_hold: 'status_on_hold',
};

const CASE_TYPE_LABELS: Record<PaymentCaseType, string> = {
  refund_request: 'คำขอคืนเงิน',
  chargeback: 'เรียกเงินคืนผ่านผู้ให้บริการชำระเงิน',
  payment_dispute: 'ข้อโต้แย้งการชำระเงิน',
  manual_review: 'รอตรวจสอบโดยแอดมิน',
};

const ADMIN_ACTION_LABELS: Record<string, string> = {
  refund: 'คืนเงิน',
  hold: 'ระงับยอด',
  release: 'ปลดระงับยอด',
  reconcile: 'กระทบยอด',
  payoutApprove: 'อนุมัติถอนเงิน',
  payoutReject: 'ปฏิเสธถอนเงิน',
  payoutPaid: 'ยืนยันโอนสำเร็จ',
};

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  purchase: 'ซื้อเหรียญ',
  refund: 'คืนเงิน',
  stripe_topup: 'เติมเหรียญผ่าน Stripe',
  chapter_unlock: 'ปลดล็อกตอน',
  admin_adjust: 'ปรับยอดโดยผู้ดูแล',
};

type AdminStats = {
  todayTransactionCount: number;
  todayCoinNet: number;
  pendingCases: number;
};

const BANGKOK_TIME_ZONE = 'Asia/Bangkok';
const BANGKOK_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: BANGKOK_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const EMPTY_STATS: AdminStats = {
  todayTransactionCount: 0,
  todayCoinNet: 0,
  pendingCases: 0,
};

function getCaseStatusLabel(status: PaymentCaseStatus) {
  return CASE_STATUS_LABELS[status] || status;
}

function getCaseStatusClassName(status: PaymentCaseStatus) {
  return CASE_STATUS_BADGE_CLASS[status] || 'status_pending';
}

function getCaseTypeLabel(caseType: PaymentCaseType) {
  return CASE_TYPE_LABELS[caseType] || caseType.replace(/_/g, ' ');
}

function getActionLabel(action: string) {
  return ADMIN_ACTION_LABELS[action] || action;
}

function getTransactionTypeLabel(txnType: string) {
  return TRANSACTION_TYPE_LABELS[txnType] || txnType.replace(/_/g, ' ');
}

function mapPayoutStatusToCaseStatus(status: CreatorPayoutRequest['status']): PaymentCaseStatus {
  if (status === 'requested') return 'open';
  if (status === 'rejected' || status === 'canceled') return 'rejected';
  if (status === 'paid') return 'resolved';
  return 'on_hold';
}

function toBangkokDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return BANGKOK_DATE_FORMATTER.format(date);
}

function calculateStats(paymentCases: PaymentCase[], coinTransactions: CoinTransaction[]): AdminStats {
  const todayKey = toBangkokDateKey(new Date());
  if (!todayKey) return { ...EMPTY_STATS };

  const todayTransactions = coinTransactions.filter((txn) => toBangkokDateKey(txn.created_at) === todayKey);
  return {
    todayTransactionCount: todayTransactions.length,
    todayCoinNet: todayTransactions.reduce((sum, txn) => sum + txn.amount, 0),
    pendingCases: paymentCases.filter((item) => item.status === 'open').length,
  };
}

export default function AdminPaymentsClient() {
  const { canTrackAnalytics } = useCookieConsent();
  const [activeTab, setActiveTab] = useState<'overview' | 'cases' | 'transactions' | 'management' | 'creatorPayouts'>('overview');
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);

  // Data State
  const [cases, setCases] = useState<PaymentCase[]>([]);
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [creatorPayouts, setCreatorPayouts] = useState<CreatorPayoutRequest[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [stats, setStats] = useState<AdminStats>(EMPTY_STATS);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Form States (Management)
  const [refundData, setRefundData] = useState({ userId: '', sourceTxnId: '', reason: '' });
  const [holdData, setHoldData] = useState({ userId: '', amount: '', reason: '', extRef: '' });
  const [payoutData, setPayoutData] = useState({
    requestId: '',
    rejectReason: '',
    transferReference: '',
    transferProofUrl: '',
  });

  // --- Auth & Access ---
  const checkAccess = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setAllowed(false); setLoading(false); return; }

      const response = await fetch('/api/admin/payments/access', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await response.json();
      setAllowed(data.allowed);
    } catch {
      setAllowed(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!allowed) return;
    setIsRefreshing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const [historyRes, payoutRes] = await Promise.all([
        fetch('/api/admin/payments/history', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        fetch('/api/admin/payouts/requests?limit=50', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
      ]);

      if (historyRes.ok) {
        const data = await historyRes.json();
        const paymentCases = (data.paymentCases || []) as PaymentCase[];
        const coinTransactions = (data.coinTransactions || []) as CoinTransaction[];
        setCases(paymentCases);
        setTransactions(coinTransactions);
        setStats(calculateStats(paymentCases, coinTransactions));
      } else {
        setCases([]);
        setTransactions([]);
        setStats({ ...EMPTY_STATS });
      }

      if (payoutRes.ok) {
        const payoutDataRes = await payoutRes.json();
        setCreatorPayouts((payoutDataRes.requests || []) as CreatorPayoutRequest[]);
      } else {
        setCreatorPayouts([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => { checkAccess(); }, [checkAccess]);
  useEffect(() => { if (allowed) fetchData(); }, [allowed, fetchData]);

  // --- API Handlers ---
  const callApi = async (action: string, path: string, payload: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    if (['refund', 'hold', 'release'].includes(action)) {
      const actionLabel = getActionLabel(action);
      if (!window.confirm(`ยืนยันการทำรายการ "${actionLabel}"?\nโปรดตรวจสอบข้อมูลให้ถูกต้องก่อนดำเนินการ`)) return;
    }

    setIsSubmitting(action);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      setLogs(prev => [{
        id: Date.now(),
        action,
        status: res.status,
        ok: res.ok,
        createdAt: new Date().toISOString(),
        response: data
      }, ...prev].slice(0, 10));

      if (canTrackAnalytics && action.startsWith('payout')) {
        void supabase.from('page_events').insert({
          user_id: session.user.id,
          session_id: `admin-${Date.now()}`,
          event_type: 'admin_payout_action',
          page_path: '/admin/payments',
          metadata: {
            action,
            ok: res.ok,
            status: res.status,
          },
        });
      }

      if (res.ok) fetchData();
      else alert(`ทำรายการไม่สำเร็จ: ${data.error || 'ไม่สามารถส่งคำขอได้'}`);
    } catch {
      alert('เชื่อมต่อเครือข่ายไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setIsSubmitting(null);
    }
  };

  // --- Filters ---
  const filteredCases = useMemo(() => {
    return cases.filter(c => {
      const matchSearch = c.id.includes(searchQuery) || c.user_id.includes(searchQuery);
      const matchStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [cases, searchQuery, statusFilter]);
  const recentCases = useMemo(() => cases.slice(0, 5), [cases]);
  const recentTransactions = useMemo(() => transactions.slice(0, 50), [transactions]);
  const todayCoinNetDisplay = `${stats.todayCoinNet >= 0 ? '+' : ''}${stats.todayCoinNet.toLocaleString('th-TH')}`;
  const todayCoinNetColor = stats.todayCoinNet >= 0 ? '#6ee7b7' : '#fda4af';

  // --- Render Helpers ---
  if (loading) return <div className={styles.loadingContainer}><RefreshCcw className={styles.spinner} /><p style={{ color: '#94a3b8' }}>กำลังโหลดข้อมูลการเงิน...</p></div>;

  if (allowed === false) return (
    <div className={styles.errorContainer}>
      <Lock size={64} color="#f43f5e" />
      <h1 style={{ color: 'white', marginTop: '1rem' }}>คุณไม่มีสิทธิ์เข้าถึงหน้านี้</h1>
      <p style={{ color: '#94a3b8' }}>กรุณาตรวจสอบค่า `FINANCE_ADMIN_USER_IDS` ในไฟล์ `.env.local`</p>
    </div>
  );

  return (
    <div className={styles.container}>
      {/* Test Tag */}
      <div className={styles.statusBanner}>
        <Zap size={16} className={styles.statusBannerIcon} />
        FLOWFIC ศูนย์จัดการการเงิน v2.1 พร้อมใช้งาน
      </div>

      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>การจัดการการเงิน</h1>
          <p>ติดตามธุรกรรมแบบเรียลไทม์ พร้อมเครื่องมือจัดการเคสและกระทบยอด</p>
        </div>
        <button onClick={fetchData} className={styles.refreshButton} disabled={isRefreshing}>
          <RefreshCcw size={18} className={isRefreshing ? styles.spin : ''} />
          {isRefreshing ? 'กำลังรีเฟรช...' : 'รีเฟรชข้อมูล'}
        </button>
      </header>

      <div className={styles.tabContainer}>
        <button className={`${styles.tab} ${activeTab === 'overview' ? styles.activeTab : ''}`} onClick={() => setActiveTab('overview')}><BarChart3 size={18} /> ภาพรวม</button>
        <button className={`${styles.tab} ${activeTab === 'management' ? styles.activeTab : ''}`} onClick={() => setActiveTab('management')}><ShieldCheck size={18} /> เครื่องมือ</button>
        <button className={`${styles.tab} ${activeTab === 'cases' ? styles.activeTab : ''}`} onClick={() => setActiveTab('cases')}><Activity size={18} /> เคส</button>
        <button className={`${styles.tab} ${activeTab === 'transactions' ? styles.activeTab : ''}`} onClick={() => setActiveTab('transactions')}><History size={18} /> ธุรกรรม</button>
        <button className={`${styles.tab} ${activeTab === 'creatorPayouts' ? styles.activeTab : ''}`} onClick={() => setActiveTab('creatorPayouts')}><Wallet size={18} /> Creator Payouts</button>
      </div>

      <main>
        {activeTab === 'overview' && (
          <>
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <div className={styles.statHeader}><div className={`${styles.statIcon} ${styles.txnIcon}`}><History size={24} /></div></div>
                <div className={styles.statValue}>{stats.todayTransactionCount.toLocaleString('th-TH')}</div>
                <div className={styles.statLabel}>ธุรกรรมเหรียญวันนี้</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statHeader}><div className={`${styles.statIcon} ${styles.revenueIcon}`}><Coins size={24} /></div></div>
                <div className={styles.statValue} style={{ color: todayCoinNetColor }}>{todayCoinNetDisplay} coin</div>
                <div className={styles.statLabel}>สุทธิเหรียญวันนี้</div>
              </div>
              <div className={styles.statCard}><div className={styles.statHeader}><div className={`${styles.statIcon} ${styles.refundIcon}`}><Activity size={24} /></div></div><div className={styles.statValue}>{stats.pendingCases}</div><div className={styles.statLabel}>เคสรอดำเนินการ</div></div>
            </div>

            <div className={styles.contentCard}>
              <div className={styles.cardHeader}><h2>กิจกรรมล่าสุด</h2></div>
              <table className={styles.table}>
                <thead><tr><th>รหัสเคส</th><th>ประเภทเคส</th><th>จำนวนเงิน</th><th>สถานะ</th><th>เวลา</th></tr></thead>
                <tbody>
                  {recentCases.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={styles.emptyTableCell}>ยังไม่มีกิจกรรมเคสการเงิน</td>
                    </tr>
                  ) : (
                    recentCases.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>#{c.id.slice(0, 8)}</td>
                        <td>{getCaseTypeLabel(c.case_type)}</td>
                        <td style={{ fontWeight: 'bold' }}>฿{(c.amount / 100).toLocaleString()}</td>
                        <td><span className={`${styles.statusBadge} ${styles[getCaseStatusClassName(c.status)]}`}>{getCaseStatusLabel(c.status)}</span></td>
                        <td>{new Date(c.created_at).toLocaleTimeString('th-TH')}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'management' && (
          <div className={styles.managementGrid}>
            {/* Refund Form */}
            <div className={styles.contentCard}>
              <h3>คืนเงินให้ผู้ใช้</h3>
              <div style={{ marginTop: '1.5rem' }}>
                <input placeholder="รหัสผู้ใช้ (UUID)" className={styles.searchInput} style={{ marginBottom: '1rem' }} value={refundData.userId} onChange={e => setRefundData({ ...refundData, userId: e.target.value })} />
                <input placeholder="รหัสธุรกรรมต้นทาง" className={styles.searchInput} style={{ marginBottom: '1rem' }} value={refundData.sourceTxnId} onChange={e => setRefundData({ ...refundData, sourceTxnId: e.target.value })} />
                <textarea placeholder="เหตุผล (ขั้นต่ำ 8 ตัวอักษร)" className={styles.searchInput} style={{ height: '80px', paddingTop: '10px', marginBottom: '1rem' }} value={refundData.reason} onChange={e => setRefundData({ ...refundData, reason: e.target.value })} />
                <button className={`${styles.backButton} ${styles.backButtonPrimary}`} style={{ width: '100%' }} onClick={() => callApi('refund', '/api/admin/payments/approve-refund', { userId: refundData.userId, sourceTransactionId: refundData.sourceTxnId, reason: refundData.reason })} disabled={isSubmitting === 'refund'}>
                  {isSubmitting === 'refund' ? 'กำลังประมวลผล...' : 'ดำเนินการคืนเงิน'}
                </button>
              </div>
            </div>

            {/* Hold Form */}
            <div className={styles.contentCard}>
              <h3>ระงับยอดชั่วคราว</h3>
              <div style={{ marginTop: '1.5rem' }}>
                <input placeholder="รหัสผู้ใช้ (UUID)" className={styles.searchInput} style={{ marginBottom: '1rem' }} value={holdData.userId} onChange={e => setHoldData({ ...holdData, userId: e.target.value })} />
                <input placeholder="จำนวนเหรียญ" type="number" className={styles.searchInput} style={{ marginBottom: '1rem' }} value={holdData.amount} onChange={e => setHoldData({ ...holdData, amount: e.target.value })} />
                <textarea placeholder="เหตุผลในการระงับ" className={styles.searchInput} style={{ height: '80px', paddingTop: '10px', marginBottom: '1rem' }} value={holdData.reason} onChange={e => setHoldData({ ...holdData, reason: e.target.value })} />
                <button className={`${styles.backButton} ${styles.backButtonDanger}`} style={{ width: '100%' }} onClick={() => callApi('hold', '/api/admin/payments/apply-chargeback-hold', { userId: holdData.userId, amount: Number(holdData.amount), reason: holdData.reason })} disabled={isSubmitting === 'hold'}>
                  {isSubmitting === 'hold' ? 'กำลังดำเนินการ...' : 'ระงับยอด'}
                </button>
              </div>
            </div>

            {/* Reconciliation */}
            <div className={`${styles.contentCard} ${styles.fullWidthCard}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3>เครื่องมือกระทบยอด</h3>
                  <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>ตรวจสอบความสอดคล้องระหว่าง Stripe กับข้อมูลธุรกรรมภายในระบบ</p>
                </div>
                <button className={styles.refreshButton} onClick={() => callApi('reconcile', '/api/admin/payments/reconcile', { mismatchThreshold: 0 })} disabled={isSubmitting === 'reconcile'}>
                  <RefreshCcw size={16} /> รันกระทบยอด
                </button>
              </div>
            </div>

            {/* Logs Area */}
            <div className={`${styles.contentCard} ${styles.fullWidthCard} ${styles.logCard}`}>
              <h3><Terminal size={18} className={styles.logCardIcon} /> บันทึกการทำรายการ</h3>
              <div className={styles.logList}>
                {logs.map(log => (
                  <div key={log.id} className={`${styles.logItem} ${log.ok ? styles.logItemOk : styles.logItemError}`}>
                    [{new Date(log.createdAt).toLocaleTimeString('th-TH')}] {getActionLabel(log.action)} {'->'} HTTP {log.status} | {JSON.stringify(log.response)}
                  </div>
                ))}
                {logs.length === 0 && <p className={styles.logEmpty}>ยังไม่มีบันทึก</p>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'cases' && (
          <div className={styles.contentCard}>
            <div className={styles.cardHeader}>
              <h2>ประวัติเคสการเงิน</h2>
              <div className={styles.filters}>
                <div className={styles.searchWrapper}>
                  <Search size={16} className={styles.searchIcon} />
                  <input placeholder="ค้นหาด้วยรหัสเคสหรือรหัสผู้ใช้..." className={styles.searchInput} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
                <select className={styles.selectInput} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="all">ทุกสถานะ</option>
                  <option value="open">รอดำเนินการ</option>
                  <option value="resolved">ปิดเคสแล้ว</option>
                  <option value="on_hold">ระงับไว้ชั่วคราว</option>
                  <option value="rejected">ปฏิเสธคำขอ</option>
                </select>
              </div>
            </div>
            <table className={styles.table}>
              <thead><tr><th>รหัสเคส</th><th>ประเภทเคส</th><th>ผู้ใช้</th><th>จำนวนเงิน</th><th>สถานะ</th><th>วันที่สร้าง</th></tr></thead>
              <tbody>
                {filteredCases.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={styles.emptyTableCell}>ไม่พบข้อมูลเคสตามเงื่อนไขที่เลือก</td>
                  </tr>
                ) : (
                  filteredCases.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8' }}>#{c.id.slice(0, 8)}</td>
                      <td>{getCaseTypeLabel(c.case_type)}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{c.user_id.slice(0, 8)}...</td>
                      <td style={{ fontWeight: 'bold' }}>฿{(c.amount / 100).toLocaleString()}</td>
                      <td><span className={`${styles.statusBadge} ${styles[getCaseStatusClassName(c.status)]}`}>{getCaseStatusLabel(c.status)}</span></td>
                      <td>{new Date(c.created_at).toLocaleDateString('th-TH')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className={styles.contentCard}>
            <div className={styles.cardHeader}><h2>ประวัติธุรกรรมเหรียญ</h2></div>
            <table className={styles.table}>
              <thead><tr><th>รหัสธุรกรรม</th><th>ผู้ใช้</th><th>จำนวนเหรียญ</th><th>ประเภทธุรกรรม</th><th>รายละเอียด</th><th>วันที่</th></tr></thead>
              <tbody>
                {recentTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={styles.emptyTableCell}>ยังไม่มีธุรกรรมเหรียญ</td>
                  </tr>
                ) : (
                  recentTransactions.map(t => (
                    <tr key={t.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8' }}>#{t.id.slice(0, 8)}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{t.user_id.slice(0, 8)}...</td>
                      <td style={{ fontWeight: 'bold', color: t.amount >= 0 ? '#34d399' : '#fb7185' }}>{t.amount >= 0 ? '+' : ''}{t.amount}</td>
                      <td><span style={{ fontSize: '0.7rem', background: '#1e293b', padding: '2px 6px', borderRadius: '4px' }}>{getTransactionTypeLabel(t.txn_type)}</span></td>
                      <td style={{ color: '#94a3b8', fontSize: '0.875rem' }}>{t.description}</td>
                      <td>{new Date(t.created_at).toLocaleDateString('th-TH')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'creatorPayouts' && (
          <div className={styles.managementGrid}>
            <div className={`${styles.contentCard} ${styles.fullWidthCard}`}>
              <div className={styles.cardHeader}>
                <h2>Creator Payout Requests</h2>
                <button
                  className={styles.refreshButton}
                  onClick={fetchData}
                  disabled={isRefreshing}
                >
                  <RefreshCcw size={16} className={isRefreshing ? styles.spin : ''} /> รีเฟรช
                </button>
              </div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>คำขอ</th>
                    <th>ผู้เขียน</th>
                    <th>สถานะ</th>
                    <th>Gross / Net</th>
                    <th>PromptPay</th>
                    <th>จำนวนรายการ</th>
                    <th>เวลา</th>
                  </tr>
                </thead>
                <tbody>
                  {creatorPayouts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={styles.emptyTableCell}>ยังไม่มีคำขอถอนเงินของนักเขียน</td>
                    </tr>
                  ) : (
                    creatorPayouts.map((item) => (
                      <tr key={item.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8' }}>#{item.id.slice(0, 8)}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{item.writerUserId.slice(0, 8)}...</td>
                        <td>
                          <span className={`${styles.statusBadge} ${styles[getCaseStatusClassName(mapPayoutStatusToCaseStatus(item.status))]}`}>
                            {item.status}
                          </span>
                        </td>
                        <td>
                          ฿{(item.grossSatang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} /{' '}
                          ฿{(item.netSatang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td>{item.promptpayTarget || item.profile?.promptpayTarget || '-'}</td>
                        <td>{item.itemCount}</td>
                        <td>{new Date(item.requestedAt).toLocaleDateString('th-TH')}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className={styles.contentCard}>
              <h3>อนุมัติคำขอถอน</h3>
              <div style={{ marginTop: '1.5rem' }}>
                <input
                  placeholder="payoutRequestId"
                  className={styles.searchInput}
                  style={{ marginBottom: '1rem' }}
                  value={payoutData.requestId}
                  onChange={e => setPayoutData({ ...payoutData, requestId: e.target.value })}
                />
                <button
                  className={`${styles.backButton} ${styles.backButtonPrimary}`}
                  style={{ width: '100%' }}
                  onClick={() => callApi('payoutApprove', '/api/admin/payouts/approve', { payoutRequestId: payoutData.requestId })}
                  disabled={isSubmitting === 'payoutApprove'}
                >
                  {isSubmitting === 'payoutApprove' ? 'กำลังอนุมัติ...' : 'อนุมัติ'}
                </button>
              </div>
            </div>

            <div className={styles.contentCard}>
              <h3>ปฏิเสธคำขอถอน</h3>
              <div style={{ marginTop: '1.5rem' }}>
                <input
                  placeholder="payoutRequestId"
                  className={styles.searchInput}
                  style={{ marginBottom: '1rem' }}
                  value={payoutData.requestId}
                  onChange={e => setPayoutData({ ...payoutData, requestId: e.target.value })}
                />
                <textarea
                  placeholder="เหตุผลการปฏิเสธ (ขั้นต่ำ 8 ตัวอักษร)"
                  className={styles.searchInput}
                  style={{ height: '80px', paddingTop: '10px', marginBottom: '1rem' }}
                  value={payoutData.rejectReason}
                  onChange={e => setPayoutData({ ...payoutData, rejectReason: e.target.value })}
                />
                <button
                  className={`${styles.backButton} ${styles.backButtonDanger}`}
                  style={{ width: '100%' }}
                  onClick={() => callApi('payoutReject', '/api/admin/payouts/reject', { payoutRequestId: payoutData.requestId, reason: payoutData.rejectReason })}
                  disabled={isSubmitting === 'payoutReject'}
                >
                  {isSubmitting === 'payoutReject' ? 'กำลังส่ง...' : 'ปฏิเสธคำขอ'}
                </button>
              </div>
            </div>

            <div className={`${styles.contentCard} ${styles.fullWidthCard}`}>
              <h3>ยืนยันโอนเงินสำเร็จ</h3>
              <div style={{ marginTop: '1.5rem' }}>
                <input
                  placeholder="payoutRequestId"
                  className={styles.searchInput}
                  style={{ marginBottom: '1rem' }}
                  value={payoutData.requestId}
                  onChange={e => setPayoutData({ ...payoutData, requestId: e.target.value })}
                />
                <input
                  placeholder="transfer reference"
                  className={styles.searchInput}
                  style={{ marginBottom: '1rem' }}
                  value={payoutData.transferReference}
                  onChange={e => setPayoutData({ ...payoutData, transferReference: e.target.value })}
                />
                <input
                  placeholder="transfer proof URL (optional)"
                  className={styles.searchInput}
                  style={{ marginBottom: '1rem' }}
                  value={payoutData.transferProofUrl}
                  onChange={e => setPayoutData({ ...payoutData, transferProofUrl: e.target.value })}
                />
                <button
                  className={`${styles.backButton} ${styles.backButtonPrimary}`}
                  style={{ width: '100%' }}
                  onClick={() =>
                    callApi('payoutPaid', '/api/admin/payouts/mark-paid', {
                      payoutRequestId: payoutData.requestId,
                      transferReference: payoutData.transferReference,
                      transferProofUrl: payoutData.transferProofUrl || null,
                    })
                  }
                  disabled={isSubmitting === 'payoutPaid'}
                >
                  {isSubmitting === 'payoutPaid' ? 'กำลังบันทึก...' : 'บันทึกว่าโอนแล้ว'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
