'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  ShieldCheck,
  Search,
  RefreshCcw,
  Coins,
  CreditCard,
  History,
  BarChart3,
  Undo2,
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
};

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  purchase: 'ซื้อเหรียญ',
  refund: 'คืนเงิน',
  stripe_topup: 'เติมเหรียญผ่าน Stripe',
  chapter_unlock: 'ปลดล็อกตอน',
  admin_adjust: 'ปรับยอดโดยผู้ดูแล',
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

export default function AdminPaymentsClient() {
  const [activeTab, setActiveTab] = useState<'overview' | 'cases' | 'transactions' | 'management'>('overview');
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);

  // Data State
  const [cases, setCases] = useState<PaymentCase[]>([]);
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [stats, setStats] = useState({
    todayRevenue: 12450,
    activeVips: 432,
    pendingRefunds: 0,
    revenueChange: 12.5,
    isDemo: true
  });

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Form States (Management)
  const [refundData, setRefundData] = useState({ userId: '', sourceTxnId: '', reason: '' });
  const [holdData, setHoldData] = useState({ userId: '', amount: '', reason: '', extRef: '' });

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

      const res = await fetch('/api/admin/payments/history', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const paymentCases = (data.paymentCases || []) as PaymentCase[];
        const coinTransactions = (data.coinTransactions || []) as CoinTransaction[];
        const hasRealData = paymentCases.length > 0 || coinTransactions.length > 0;

        if (hasRealData) {
          setCases(paymentCases);
          setTransactions(coinTransactions);
          const pending = paymentCases.filter((item) => item.status === 'open').length;
          setStats(prev => ({ ...prev, pendingRefunds: pending, isDemo: false }));
        } else {
          // แสดงข้อมูลตัวอย่างเมื่อไม่มีข้อมูลจริง
          setCases([
            { id: 'demo-001', case_type: 'refund_request', status: 'open', user_id: 'abc123', amount: 500, currency: 'THB', reason: 'ทดสอบการคืนเงิน', external_reference: null, source_txn_id: 'txn_demo_1', hold_txn_id: null, resolution_txn_id: null, opened_by: null, resolved_by: null, resolved_at: null, created_at: new Date().toISOString() },
            { id: 'demo-002', case_type: 'chargeback', status: 'resolved', user_id: 'xyz789', amount: 1500, currency: 'THB', reason: 'คำขอคืนเงิน', external_reference: null, source_txn_id: 'txn_demo_2', hold_txn_id: null, resolution_txn_id: null, opened_by: null, resolved_by: null, resolved_at: null, created_at: new Date(Date.now() - 86400000).toISOString() }
          ]);
          setTransactions([
            { id: 'txn-001', user_id: 'abc123', amount: 100, txn_type: 'purchase', description: 'ซื้อเหรียญ 100 เหรียญ', created_at: new Date().toISOString(), reference_type: null, reference_id: null, policy_version: null, reversal_of_txn_id: null },
            { id: 'txn-002', user_id: 'xyz789', amount: -50, txn_type: 'refund', description: 'คืนเงิน 50 เหรียญ', created_at: new Date(Date.now() - 3600000).toISOString(), reference_type: null, reference_id: null, policy_version: null, reversal_of_txn_id: null }
          ]);
          setStats(prev => ({ ...prev, pendingRefunds: 1, isDemo: true }));
        }
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
        FLOWFIC ศูนย์จัดการการเงิน v2.1 พร้อมใช้งาน {stats.isDemo && <span className={styles.statusBannerMeta}>(ข้อมูลตัวอย่าง)</span>}
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
      </div>

      <main>
        {activeTab === 'overview' && (
          <>
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <div className={styles.statHeader}><div className={`${styles.statIcon} ${styles.revenueIcon}`}><Coins size={24} /></div><span className={styles.trendUp}>+{stats.revenueChange}%</span></div>
                <div className={styles.statValue}>฿{(stats.todayRevenue / 100).toLocaleString()}</div>
                <div className={styles.statLabel}>รายได้วันนี้</div>
              </div>
              <div className={styles.statCard}><div className={styles.statHeader}><div className={`${styles.statIcon} ${styles.vipIcon}`}><CreditCard size={24} /></div></div><div className={styles.statValue}>{stats.activeVips}</div><div className={styles.statLabel}>สมาชิก VIP ที่ใช้งานอยู่</div></div>
              <div className={styles.statCard}><div className={styles.statHeader}><div className={`${styles.statIcon} ${styles.refundIcon}`}><Undo2 size={24} /></div></div><div className={styles.statValue}>{stats.pendingRefunds}</div><div className={styles.statLabel}>เคสที่รอดำเนินการ</div></div>
            </div>

            <div className={styles.contentCard}>
              <div className={styles.cardHeader}><h2>กิจกรรมล่าสุด</h2></div>
              <table className={styles.table}>
                <thead><tr><th>รหัสเคส</th><th>ประเภทเคส</th><th>จำนวนเงิน</th><th>สถานะ</th><th>เวลา</th></tr></thead>
                <tbody>
                  {cases.slice(0, 5).map(c => (
                    <tr key={c.id}>
                      <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>#{c.id.slice(0, 8)}</td>
                      <td>{getCaseTypeLabel(c.case_type)}</td>
                      <td style={{ fontWeight: 'bold' }}>฿{(c.amount / 100).toLocaleString()}</td>
                      <td><span className={`${styles.statusBadge} ${styles[getCaseStatusClassName(c.status)]}`}>{getCaseStatusLabel(c.status)}</span></td>
                      <td>{new Date(c.created_at).toLocaleTimeString('th-TH')}</td>
                    </tr>
                  ))}
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
                {filteredCases.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8' }}>#{c.id.slice(0, 8)}</td>
                    <td>{getCaseTypeLabel(c.case_type)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{c.user_id.slice(0, 8)}...</td>
                    <td style={{ fontWeight: 'bold' }}>฿{(c.amount / 100).toLocaleString()}</td>
                    <td><span className={`${styles.statusBadge} ${styles[getCaseStatusClassName(c.status)]}`}>{getCaseStatusLabel(c.status)}</span></td>
                    <td>{new Date(c.created_at).toLocaleDateString('th-TH')}</td>
                  </tr>
                ))}
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
                {transactions.slice(0, 50).map(t => (
                  <tr key={t.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8' }}>#{t.id.slice(0, 8)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{t.user_id.slice(0, 8)}...</td>
                    <td style={{ fontWeight: 'bold', color: t.amount >= 0 ? '#34d399' : '#fb7185' }}>{t.amount >= 0 ? '+' : ''}{t.amount}</td>
                    <td><span style={{ fontSize: '0.7rem', background: '#1e293b', padding: '2px 6px', borderRadius: '4px' }}>{getTransactionTypeLabel(t.txn_type)}</span></td>
                    <td style={{ color: '#94a3b8', fontSize: '0.875rem' }}>{t.description}</td>
                    <td>{new Date(t.created_at).toLocaleDateString('th-TH')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
