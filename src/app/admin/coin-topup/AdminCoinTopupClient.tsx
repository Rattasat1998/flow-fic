'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, RefreshCcw, Search, ShieldAlert, UserRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCookieConsent } from '@/contexts/CookieConsentContext';
import styles from './coin-topup.module.css';

type AdminUserRow = {
  id: string;
  email: string | null;
  penName: string | null;
  avatarUrl: string | null;
  coinBalance: number;
  vipStatus: string;
  vipPlanCode: string | null;
  vipCurrentPeriodEnd: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
};

type CoinTransaction = {
  id: string;
  user_id: string;
  amount: number;
  txn_type: string;
  description: string;
  created_at: string;
  reference_type: string | null;
  reference_id: string | null;
};

type UsersResponse = {
  success?: boolean;
  users?: AdminUserRow[];
  error?: string;
};

type PaymentHistoryResponse = {
  success?: boolean;
  coinTransactions?: CoinTransaction[];
  error?: string;
};

type TopupResponse = {
  success?: boolean;
  transactionId?: string | null;
  newBalance?: number;
  correlationId?: string;
  error?: string;
  code?: string;
};

const MAX_TOPUP_COINS = 1_000_000;

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function getTransactionTypeLabel(type: string) {
  switch (type) {
    case 'admin_adjust':
      return 'ปรับยอดโดยผู้ดูแล';
    case 'stripe_topup':
      return 'เติมเหรียญผ่าน Stripe';
    case 'chapter_unlock':
      return 'ปลดล็อกตอน';
    case 'refund':
      return 'คืนเงิน';
    default:
      return type;
  }
}

export default function AdminCoinTopupClient() {
  const { canTrackAnalytics } = useCookieConsent();
  const [allowed, setAllowed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return null;
    }

    return session.access_token;
  }, []);

  const fetchUsers = useCallback(async (searchText: string) => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setAllowed(false);
      setUsers([]);
      setLoading(false);
      setIsSearching(false);
      return;
    }

    const params = new URLSearchParams({
      page: '1',
      limit: '20',
    });

    const normalizedQuery = searchText.trim();
    if (normalizedQuery) {
      params.set('q', normalizedQuery);
    }

    const response = await fetch(`/api/admin/users?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const payload = (await response.json()) as UsersResponse;

    if (response.status === 401 || response.status === 403) {
      setAllowed(false);
      setUsers([]);
      setLoading(false);
      setIsSearching(false);
      return;
    }

    if (!response.ok) {
      throw new Error(payload.error || 'ไม่สามารถค้นหาผู้ใช้ได้');
    }

    setAllowed(true);
    setUsers(payload.users || []);
    setLoading(false);
    setIsSearching(false);
  }, [getAccessToken]);

  const fetchUserTransactions = useCallback(async (userId: string) => {
    setLoadingTx(true);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setAllowed(false);
        setTransactions([]);
        return;
      }

      const response = await fetch(`/api/admin/payments/history?userId=${encodeURIComponent(userId)}&limit=20`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const payload = (await response.json()) as PaymentHistoryResponse;

      if (response.status === 401 || response.status === 403) {
        setAllowed(false);
        setTransactions([]);
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error || 'ไม่สามารถดึงประวัติธุรกรรมได้');
      }

      setTransactions(payload.coinTransactions || []);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'ไม่สามารถดึงประวัติธุรกรรมได้';
      setError(message);
      setTransactions([]);
    } finally {
      setLoadingTx(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    let isCancelled = false;
    const timer = setTimeout(async () => {
      if (isCancelled) return;

      if (!loading) {
        setIsSearching(true);
      }

      setError(null);
      try {
        await fetchUsers(query);
      } catch (fetchError) {
        if (isCancelled) return;
        const message = fetchError instanceof Error ? fetchError.message : 'ไม่สามารถค้นหาผู้ใช้ได้';
        setError(message);
        setLoading(false);
        setIsSearching(false);
      }
    }, 250);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [fetchUsers, loading, query]);

  useEffect(() => {
    if (!selectedUser?.id) {
      setTransactions([]);
      return;
    }

    void fetchUserTransactions(selectedUser.id);
  }, [fetchUserTransactions, selectedUser?.id]);

  const parsedAmount = Number(amount);
  const topupAmount = Number.isInteger(parsedAmount) ? parsedAmount : 0;

  const previewBalance = useMemo(() => {
    const before = selectedUser?.coinBalance || 0;
    const validTopup = topupAmount > 0 ? topupAmount : 0;
    return {
      before,
      after: before + validTopup,
    };
  }, [selectedUser?.coinBalance, topupAmount]);

  const handleSubmitTopup = useCallback(async () => {
    if (!selectedUser) {
      setError('กรุณาเลือกผู้ใช้ก่อนเติม coin');
      return;
    }

    if (!Number.isInteger(topupAmount) || topupAmount <= 0 || topupAmount > MAX_TOPUP_COINS) {
      setError(`จำนวน coin ต้องเป็นจำนวนเต็มระหว่าง 1 ถึง ${MAX_TOPUP_COINS.toLocaleString('th-TH')}`);
      return;
    }

    if (reason.trim().length < 8) {
      setError('กรุณากรอกเหตุผลอย่างน้อย 8 ตัวอักษร');
      return;
    }

    const confirmed = window.confirm(
      `ยืนยันเติม coin ให้ผู้ใช้คนนี้หรือไม่?\nผู้ใช้: ${selectedUser.email || selectedUser.id}\nจำนวน: ${topupAmount.toLocaleString('th-TH')} coin`
    );

    if (!confirmed) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setAllowed(false);
        setIsSubmitting(false);
        return;
      }

      const correlationId = typeof window !== 'undefined' && window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `topup-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

      const response = await fetch('/api/admin/payments/topup-coins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: selectedUser.id,
          amount: topupAmount,
          reason: reason.trim(),
          correlationId,
        }),
      });

      const payload = (await response.json()) as TopupResponse;

      if (canTrackAnalytics) {
        void supabase.from('page_events').insert({
          user_id: session.user.id,
          session_id: `admin-${Date.now()}`,
          event_type: 'admin_coin_topup_action',
          page_path: '/admin/coin-topup',
          metadata: {
            ok: response.ok,
            status: response.status,
            target_user_id: selectedUser.id,
            amount: topupAmount,
            transaction_id: payload.transactionId || null,
            code: payload.code || null,
          },
        });
      }

      if (response.status === 401 || response.status === 403) {
        setAllowed(false);
        return;
      }

      if (!response.ok || !payload.success || typeof payload.newBalance !== 'number') {
        throw new Error(payload.error || 'เติม coin ไม่สำเร็จ');
      }

      const transactionIdText = payload.transactionId ? ` (Txn: ${payload.transactionId})` : '';
      setSuccessMessage(`เติม coin สำเร็จ ยอดใหม่ ${payload.newBalance.toLocaleString('th-TH')} coin${transactionIdText}`);

      setSelectedUser((current) => {
        if (!current) return current;
        return {
          ...current,
          coinBalance: payload.newBalance as number,
        };
      });

      setUsers((current) => current.map((item) => (
        item.id === selectedUser.id
          ? { ...item, coinBalance: payload.newBalance as number }
          : item
      )));

      setAmount('');
      setReason('');
      await fetchUserTransactions(selectedUser.id);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'เติม coin ไม่สำเร็จ';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [canTrackAnalytics, fetchUserTransactions, reason, selectedUser, topupAmount]);

  if (loading) {
    return (
      <section className={styles.stateContainer}>
        <RefreshCcw className={styles.spin} />
        <p>กำลังโหลดระบบเติม coin...</p>
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

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>เติม Coin ให้ผู้ใช้</h1>
          <p>เติมเหรียญแบบ manual ผ่าน ledger โดยผู้ดูแลการเงิน</p>
        </div>
      </header>

      {error ? <p className={styles.errorBanner}>{error}</p> : null}
      {successMessage ? <p className={styles.successBanner}>{successMessage}</p> : null}

      <section className={styles.searchSection}>
        <label htmlFor="coin-topup-user-search">ค้นหาผู้ใช้</label>
        <div className={styles.searchBox}>
          <Search size={16} />
          <input
            id="coin-topup-user-search"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาด้วย UUID, อีเมล หรือ pen name"
          />
          {isSearching ? <RefreshCcw size={15} className={styles.spin} /> : null}
        </div>

        <div className={styles.searchResults}>
          {users.length === 0 ? (
            <p className={styles.emptyText}>ไม่พบผู้ใช้</p>
          ) : (
            users.map((user) => (
              <button
                key={user.id}
                type="button"
                className={`${styles.userItem} ${selectedUser?.id === user.id ? styles.userItemActive : ''}`}
                onClick={() => {
                  setSelectedUser(user);
                  setSuccessMessage(null);
                }}
              >
                <UserRound size={14} />
                <span className={styles.userItemTitle}>{user.penName || user.email || user.id}</span>
                <span className={styles.userItemMeta}>ยอด {user.coinBalance.toLocaleString('th-TH')} coin</span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className={styles.topupGrid}>
        <div className={styles.card}>
          <h2>ผู้ใช้ที่เลือก</h2>
          {!selectedUser ? (
            <p className={styles.emptyText}>ยังไม่ได้เลือกผู้ใช้</p>
          ) : (
            <div className={styles.userDetails}>
              <p><strong>UUID:</strong> {selectedUser.id}</p>
              <p><strong>Email:</strong> {selectedUser.email || '-'}</p>
              <p><strong>Pen Name:</strong> {selectedUser.penName || '-'}</p>
              <p><strong>ยอดปัจจุบัน:</strong> {selectedUser.coinBalance.toLocaleString('th-TH')} coin</p>
            </div>
          )}
        </div>

        <div className={styles.card}>
          <h2>ฟอร์มเติม Coin</h2>
          <div className={styles.formGroup}>
            <label htmlFor="coin-topup-amount">จำนวน coin</label>
            <input
              id="coin-topup-amount"
              className={styles.input}
              type="number"
              min={1}
              max={MAX_TOPUP_COINS}
              step={1}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="เช่น 100"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="coin-topup-reason">เหตุผล (อย่างน้อย 8 ตัวอักษร)</label>
            <textarea
              id="coin-topup-reason"
              className={styles.textarea}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="เช่น ชดเชยเหตุขัดข้องระบบ"
            />
          </div>

          <div className={styles.previewBox}>
            <p>ยอดก่อนเติม: {previewBalance.before.toLocaleString('th-TH')} coin</p>
            <p>ยอดหลังเติม: {previewBalance.after.toLocaleString('th-TH')} coin</p>
          </div>

          <button
            type="button"
            className={styles.submitButton}
            onClick={() => void handleSubmitTopup()}
            disabled={isSubmitting || !selectedUser}
          >
            <Coins size={16} />
            {isSubmitting ? 'กำลังเติม coin...' : 'ยืนยันเติม coin'}
          </button>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2>ธุรกรรมล่าสุดของผู้ใช้</h2>
          {selectedUser ? (
            <button
              type="button"
              className={styles.refreshButton}
              onClick={() => void fetchUserTransactions(selectedUser.id)}
              disabled={loadingTx}
            >
              <RefreshCcw size={14} className={loadingTx ? styles.spin : ''} />
              รีเฟรช
            </button>
          ) : null}
        </div>

        {!selectedUser ? (
          <p className={styles.emptyText}>เลือกผู้ใช้เพื่อดูประวัติธุรกรรม</p>
        ) : loadingTx ? (
          <p className={styles.emptyText}>กำลังโหลดธุรกรรม...</p>
        ) : transactions.length === 0 ? (
          <p className={styles.emptyText}>ยังไม่มีธุรกรรม</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>เวลา</th>
                  <th>ประเภท</th>
                  <th>จำนวน</th>
                  <th>รายละเอียด</th>
                  <th>Transaction</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDate(item.created_at)}</td>
                    <td>{getTransactionTypeLabel(item.txn_type)}</td>
                    <td className={item.amount >= 0 ? styles.amountPlus : styles.amountMinus}>
                      {item.amount >= 0 ? '+' : ''}{item.amount.toLocaleString('th-TH')} coin
                    </td>
                    <td>{item.description || '-'}</td>
                    <td className={styles.mono}>{item.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
