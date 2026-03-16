'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import styles from './page.module.css';

type AdminLog = {
  id: number;
  action: string;
  status: number;
  ok: boolean;
  createdAt: string;
  request: unknown;
  response: unknown;
};

type PaymentCaseHistoryRow = {
  id: string;
  case_type: string;
  status: string;
  user_id: string;
  amount: number;
  currency: string;
  reason: string;
  external_reference: string | null;
  source_txn_id: string | null;
  hold_txn_id: string | null;
  resolution_txn_id: string | null;
  opened_by: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};

type CoinTransactionHistoryRow = {
  id: string;
  user_id: string;
  amount: number;
  txn_type: string;
  description: string | null;
  created_at: string;
  reference_type: string | null;
  reference_id: string | null;
  policy_version: string | null;
  reversal_of_txn_id: string | null;
};

function toIsoOrUndefined(localDateTime: string) {
  const trimmed = localDateTime.trim();
  if (!trimmed) return undefined;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function safePretty(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function AdminPaymentsPage() {
  const { user, session, isLoading } = useAuth();
  const userId = user?.id ?? null;

  const [isSubmittingAction, setIsSubmittingAction] = useState<string | null>(null);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [accessState, setAccessState] = useState<'checking' | 'allowed' | 'denied'>('checking');
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const [historyUserId, setHistoryUserId] = useState('');
  const [historyPaymentCaseId, setHistoryPaymentCaseId] = useState('');
  const [historySourceTransactionId, setHistorySourceTransactionId] = useState('');
  const [historyLimit, setHistoryLimit] = useState('25');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoadedAt, setHistoryLoadedAt] = useState<string | null>(null);
  const [paymentCases, setPaymentCases] = useState<PaymentCaseHistoryRow[]>([]);
  const [coinTransactions, setCoinTransactions] = useState<CoinTransactionHistoryRow[]>([]);

  const [reconcileWindowStart, setReconcileWindowStart] = useState('');
  const [reconcileWindowEnd, setReconcileWindowEnd] = useState('');
  const [reconcileMismatchThreshold, setReconcileMismatchThreshold] = useState('0');

  const [refundUserId, setRefundUserId] = useState('');
  const [refundSourceTransactionId, setRefundSourceTransactionId] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundCorrelationId, setRefundCorrelationId] = useState('');

  const [holdUserId, setHoldUserId] = useState('');
  const [holdAmount, setHoldAmount] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [holdExternalReference, setHoldExternalReference] = useState('');
  const [holdCorrelationId, setHoldCorrelationId] = useState('');

  const [releasePaymentCaseId, setReleasePaymentCaseId] = useState('');
  const [releaseReason, setReleaseReason] = useState('');
  const [releaseCorrelationId, setReleaseCorrelationId] = useState('');

  const latestLog = useMemo(() => (logs.length > 0 ? logs[0] : null), [logs]);

  const getAccessToken = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error('[Admin Payments] Session error:', error);
      return null;
    }
    return data.session?.access_token || null;
  }, []);

  const fetchHistory = useCallback(async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setHistoryError('กรุณาเข้าสู่ระบบก่อนใช้งาน');
      return;
    }

    const limit = Math.max(1, Math.min(100, Math.floor(Number(historyLimit || '25'))));
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (historyUserId.trim()) {
      params.set('userId', historyUserId.trim());
    }
    if (historyPaymentCaseId.trim()) {
      params.set('paymentCaseId', historyPaymentCaseId.trim());
    }
    if (historySourceTransactionId.trim()) {
      params.set('sourceTransactionId', historySourceTransactionId.trim());
    }

    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const response = await fetch(`/api/admin/payments/history?${params.toString()}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const payload = (await response.json()) as {
        error?: string;
        paymentCases?: PaymentCaseHistoryRow[];
        coinTransactions?: CoinTransactionHistoryRow[];
      };

      if (!response.ok) {
        setHistoryError(payload.error || `โหลด history ไม่สำเร็จ (${response.status})`);
        return;
      }

      setPaymentCases(payload.paymentCases || []);
      setCoinTransactions(payload.coinTransactions || []);
      setHistoryLoadedAt(new Date().toISOString());
    } catch {
      setHistoryError('เกิดข้อผิดพลาดระหว่างโหลด history');
    } finally {
      setHistoryLoading(false);
    }
  }, [
    getAccessToken,
    historyLimit,
    historyUserId,
    historyPaymentCaseId,
    historySourceTransactionId,
  ]);

  useEffect(() => {
    if (!userId) {
      setAccessState('denied');
      setAccessMessage('กรุณาเข้าสู่ระบบก่อนใช้งานหน้าแอดมิน');
      return;
    }

    let isCancelled = false;
    const verifyAccess = async () => {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        if (isCancelled) return;
        setAccessState('denied');
        setAccessMessage('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
        return;
      }

      setAccessState('checking');
      setAccessMessage(null);
      try {
        const response = await fetch('/api/admin/payments/access', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (isCancelled) return;

        if (response.ok) {
          setAccessState('allowed');
          return;
        }

        let errorMessage = 'ไม่สามารถตรวจสอบสิทธิ์แอดมินได้';
        try {
          const payload = (await response.json()) as { error?: string };
          if (payload?.error) errorMessage = payload.error;
        } catch {
          // ignore parse error
        }

        if (response.status === 403) {
          errorMessage = 'บัญชีนี้ไม่มีสิทธิ์เข้าถึงหน้าแอดมินการเงิน';
        } else if (response.status === 401) {
          errorMessage = 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';
        }

        setAccessState('denied');
        setAccessMessage(errorMessage);
      } catch {
        if (isCancelled) return;
        setAccessState('denied');
        setAccessMessage('เกิดข้อผิดพลาดระหว่างตรวจสอบสิทธิ์');
      }
    };

    verifyAccess();
    return () => {
      isCancelled = true;
    };
  }, [getAccessToken, userId]);

  useEffect(() => {
    if (accessState !== 'allowed') return;
    fetchHistory();
  }, [accessState, fetchHistory]);

  const confirmDangerousAction = (actionLabel: string, payload: Record<string, unknown>) => {
    if (typeof window === 'undefined') return true;
    const summary = safePretty(payload);
    return window.confirm(
      `ยืนยันการทำรายการ: ${actionLabel}\n\nPayload:\n${summary}\n\nโปรดตรวจสอบข้อมูลให้ถูกต้องก่อนยืนยัน`
    );
  };

  const callAdminApi = async (action: string, path: string, payload: Record<string, unknown>) => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setFormError('กรุณาเข้าสู่ระบบก่อนใช้งาน');
      return false;
    }

    setIsSubmittingAction(action);
    setFormError(null);

    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      const contentType = response.headers.get('content-type') || '';
      let responseBody: unknown;
      if (contentType.includes('application/json')) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
      }

      setLogs((prev) => [
        {
          id: Date.now(),
          action,
          status: response.status,
          ok: response.ok,
          createdAt: new Date().toISOString(),
          request: payload,
          response: responseBody,
        },
        ...prev,
      ].slice(0, 20));

      if (!response.ok) {
        const errorText = typeof responseBody === 'object' && responseBody !== null && 'error' in responseBody
          ? String((responseBody as { error: unknown }).error)
          : `Request failed (${response.status})`;
        setFormError(errorText);
        return false;
      }
      return true;
    } catch {
      setFormError('เกิดข้อผิดพลาดระหว่างเรียก API');
      return false;
    } finally {
      setIsSubmittingAction(null);
    }
  };

  const handleReconcile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload: Record<string, unknown> = {
      mismatchThreshold: Math.max(0, Math.floor(Number(reconcileMismatchThreshold || '0'))),
    };
    const windowStartIso = toIsoOrUndefined(reconcileWindowStart);
    const windowEndIso = toIsoOrUndefined(reconcileWindowEnd);
    if (windowStartIso) payload.windowStart = windowStartIso;
    if (windowEndIso) payload.windowEnd = windowEndIso;
    const ok = await callAdminApi('reconcile', '/api/admin/payments/reconcile', payload);
    if (ok) await fetchHistory();
  };

  const handleApproveRefund = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (refundReason.trim().length < 8) {
      setFormError('เหตุผลต้องยาวอย่างน้อย 8 ตัวอักษร');
      return;
    }
    const payload = {
      userId: refundUserId.trim(),
      sourceTransactionId: refundSourceTransactionId.trim(),
      reason: refundReason.trim(),
      correlationId: refundCorrelationId.trim() || undefined,
    };
    if (!confirmDangerousAction('Approve Refund', payload)) return;
    const ok = await callAdminApi('approve-refund', '/api/admin/payments/approve-refund', payload);
    if (ok) await fetchHistory();
  };

  const handleApplyHold = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (holdReason.trim().length < 8) {
      setFormError('เหตุผลต้องยาวอย่างน้อย 8 ตัวอักษร');
      return;
    }
    const payload = {
      userId: holdUserId.trim(),
      amount: Number(holdAmount || '0'),
      reason: holdReason.trim(),
      externalReference: holdExternalReference.trim() || undefined,
      correlationId: holdCorrelationId.trim() || undefined,
    };
    if (!confirmDangerousAction('Apply Chargeback Hold', payload)) return;
    const ok = await callAdminApi('apply-chargeback-hold', '/api/admin/payments/apply-chargeback-hold', payload);
    if (ok) await fetchHistory();
  };

  const handleReleaseHold = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (releaseReason.trim().length < 8) {
      setFormError('เหตุผลต้องยาวอย่างน้อย 8 ตัวอักษร');
      return;
    }
    const payload = {
      paymentCaseId: releasePaymentCaseId.trim(),
      reason: releaseReason.trim(),
      correlationId: releaseCorrelationId.trim() || undefined,
    };
    if (!confirmDangerousAction('Release Hold', payload)) return;
    const ok = await callAdminApi('release-hold', '/api/admin/payments/release-hold', payload);
    if (ok) await fetchHistory();
  };

  if (isLoading) {
    return (
      <main className={styles.main}>
        <div className={styles.container}>
          <p className={styles.stateMessage}>กำลังโหลดสถานะผู้ใช้...</p>
        </div>
      </main>
    );
  }

  if (!user || !session) {
    return (
      <main className={styles.main}>
        <div className={styles.container}>
          <h1 className={styles.title}>Admin Payments</h1>
          <p className={styles.stateMessage}>กรุณาเข้าสู่ระบบก่อนใช้งานหน้าแอดมิน</p>
          <Link href="/" className={styles.backLink}>กลับหน้าแรก</Link>
        </div>
      </main>
    );
  }

  if (accessState === 'checking') {
    return (
      <main className={styles.main}>
        <div className={styles.container}>
          <h1 className={styles.title}>Admin Payments</h1>
          <p className={styles.stateMessage}>กำลังตรวจสอบสิทธิ์แอดมิน...</p>
          <Link href="/dashboard" className={styles.backLink}>กลับ Dashboard</Link>
        </div>
      </main>
    );
  }

  if (accessState === 'denied') {
    return (
      <main className={styles.main}>
        <div className={styles.container}>
          <h1 className={styles.title}>Admin Payments</h1>
          <p className={styles.stateMessage}>{accessMessage || 'ไม่มีสิทธิ์เข้าถึงหน้าแอดมิน'}</p>
          <Link href="/dashboard" className={styles.backLink}>กลับ Dashboard</Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Admin Payments</h1>
            <p className={styles.subtitle}>เครื่องมือปฏิบัติการการเงิน: reconcile, refund, chargeback hold/release</p>
          </div>
          <div className={styles.headerMeta}>
            <div>Signed in: {user.email || user.id}</div>
            <Link href="/dashboard" className={styles.backLink}>กลับ Dashboard</Link>
          </div>
        </header>

        {formError && <p className={styles.errorBanner}>Error: {formError}</p>}

        <section className={styles.grid}>
          <form className={styles.card} onSubmit={handleReconcile}>
            <h2>Reconciliation</h2>
            <p className={styles.cardDesc}>รันตรวจความตรงกันระหว่าง Stripe กับ Ledger</p>

            <label className={styles.label}>
              Window Start (optional)
              <input
                type="datetime-local"
                value={reconcileWindowStart}
                onChange={(event) => setReconcileWindowStart(event.target.value)}
                className={styles.input}
              />
            </label>
            <label className={styles.label}>
              Window End (optional)
              <input
                type="datetime-local"
                value={reconcileWindowEnd}
                onChange={(event) => setReconcileWindowEnd(event.target.value)}
                className={styles.input}
              />
            </label>
            <label className={styles.label}>
              Mismatch Threshold
              <input
                type="number"
                min={0}
                value={reconcileMismatchThreshold}
                onChange={(event) => setReconcileMismatchThreshold(event.target.value)}
                className={styles.input}
              />
            </label>
            <button type="submit" className={styles.submitButton} disabled={isSubmittingAction !== null}>
              {isSubmittingAction === 'reconcile' ? 'Running...' : 'Run Reconcile'}
            </button>
          </form>

          <form className={styles.card} onSubmit={handleApproveRefund}>
            <h2>Approve Refund</h2>
            <p className={styles.cardDesc}>คืนเหรียญจาก top-up เดิม (เฉพาะกรณีเข้าเงื่อนไข)</p>

            <label className={styles.label}>
              User ID
              <input
                type="text"
                value={refundUserId}
                onChange={(event) => setRefundUserId(event.target.value)}
                className={styles.input}
                required
              />
            </label>
            <label className={styles.label}>
              Source Transaction ID
              <input
                type="text"
                value={refundSourceTransactionId}
                onChange={(event) => setRefundSourceTransactionId(event.target.value)}
                className={styles.input}
                required
              />
            </label>
            <label className={styles.label}>
              Reason (&gt;= 8 chars)
              <textarea
                value={refundReason}
                onChange={(event) => setRefundReason(event.target.value)}
                className={styles.textarea}
                required
              />
            </label>
            <label className={styles.label}>
              Correlation ID (optional)
              <input
                type="text"
                value={refundCorrelationId}
                onChange={(event) => setRefundCorrelationId(event.target.value)}
                className={styles.input}
              />
            </label>
            <button type="submit" className={styles.submitButton} disabled={isSubmittingAction !== null}>
              {isSubmittingAction === 'approve-refund' ? 'Submitting...' : 'Approve Refund'}
            </button>
          </form>

          <form className={styles.card} onSubmit={handleApplyHold}>
            <h2>Apply Chargeback Hold</h2>
            <p className={styles.cardDesc}>ระงับสิทธิ์การเงินและลงรายการ hold แบบ reversible</p>

            <label className={styles.label}>
              User ID
              <input
                type="text"
                value={holdUserId}
                onChange={(event) => setHoldUserId(event.target.value)}
                className={styles.input}
                required
              />
            </label>
            <label className={styles.label}>
              Amount
              <input
                type="number"
                min={1}
                value={holdAmount}
                onChange={(event) => setHoldAmount(event.target.value)}
                className={styles.input}
                required
              />
            </label>
            <label className={styles.label}>
              Reason (&gt;= 8 chars)
              <textarea
                value={holdReason}
                onChange={(event) => setHoldReason(event.target.value)}
                className={styles.textarea}
                required
              />
            </label>
            <label className={styles.label}>
              External Reference (optional)
              <input
                type="text"
                value={holdExternalReference}
                onChange={(event) => setHoldExternalReference(event.target.value)}
                className={styles.input}
              />
            </label>
            <label className={styles.label}>
              Correlation ID (optional)
              <input
                type="text"
                value={holdCorrelationId}
                onChange={(event) => setHoldCorrelationId(event.target.value)}
                className={styles.input}
              />
            </label>
            <button type="submit" className={styles.submitButton} disabled={isSubmittingAction !== null}>
              {isSubmittingAction === 'apply-chargeback-hold' ? 'Submitting...' : 'Apply Hold'}
            </button>
          </form>

          <form className={styles.card} onSubmit={handleReleaseHold}>
            <h2>Release Hold</h2>
            <p className={styles.cardDesc}>ปล่อย hold และคืนสถานะผู้ใช้ตามเงื่อนไข</p>

            <label className={styles.label}>
              Payment Case ID
              <input
                type="text"
                value={releasePaymentCaseId}
                onChange={(event) => setReleasePaymentCaseId(event.target.value)}
                className={styles.input}
                required
              />
            </label>
            <label className={styles.label}>
              Reason (&gt;= 8 chars)
              <textarea
                value={releaseReason}
                onChange={(event) => setReleaseReason(event.target.value)}
                className={styles.textarea}
                required
              />
            </label>
            <label className={styles.label}>
              Correlation ID (optional)
              <input
                type="text"
                value={releaseCorrelationId}
                onChange={(event) => setReleaseCorrelationId(event.target.value)}
                className={styles.input}
              />
            </label>
            <button type="submit" className={styles.submitButton} disabled={isSubmittingAction !== null}>
              {isSubmittingAction === 'release-hold' ? 'Submitting...' : 'Release Hold'}
            </button>
          </form>
        </section>

        <section className={styles.logsCard}>
          <h2>Latest Response</h2>
          {latestLog ? (
            <>
              <div className={styles.logMeta}>
                <span>Action: {latestLog.action}</span>
                <span>Status: {latestLog.status}</span>
                <span>At: {new Date(latestLog.createdAt).toLocaleString()}</span>
              </div>
              <pre className={styles.logPre}>{safePretty(latestLog.response)}</pre>
            </>
          ) : (
            <p className={styles.cardDesc}>ยังไม่มีการเรียกใช้งาน</p>
          )}
        </section>

        <section className={styles.historyCard}>
          <div className={styles.historyHeader}>
            <h2>Operation History</h2>
            <div className={styles.historyActions}>
              {historyLoadedAt && (
                <span className={styles.historyLoadedAt}>
                  Updated: {new Date(historyLoadedAt).toLocaleString()}
                </span>
              )}
              <button
                type="button"
                className={styles.refreshButton}
                onClick={fetchHistory}
                disabled={historyLoading || isSubmittingAction !== null}
              >
                {historyLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          <div className={styles.historyFilters}>
            <label className={styles.label}>
              Filter User ID (optional)
              <input
                type="text"
                className={styles.input}
                value={historyUserId}
                onChange={(event) => setHistoryUserId(event.target.value)}
                placeholder="uuid user_id"
              />
            </label>
            <label className={styles.label}>
              Filter Payment Case ID (optional)
              <input
                type="text"
                className={styles.input}
                value={historyPaymentCaseId}
                onChange={(event) => setHistoryPaymentCaseId(event.target.value)}
                placeholder="uuid payment_case_id"
              />
            </label>
            <label className={styles.label}>
              Filter Source Transaction ID (optional)
              <input
                type="text"
                className={styles.input}
                value={historySourceTransactionId}
                onChange={(event) => setHistorySourceTransactionId(event.target.value)}
                placeholder="uuid source_txn_id"
              />
            </label>
            <label className={styles.label}>
              Rows (1-100)
              <input
                type="number"
                min={1}
                max={100}
                className={styles.input}
                value={historyLimit}
                onChange={(event) => setHistoryLimit(event.target.value)}
              />
            </label>
          </div>
          <p className={styles.cardDesc}>เปลี่ยนเงื่อนไขกรองแล้วกด Refresh เพื่อโหลดข้อมูลใหม่</p>

          {historyError && <p className={styles.errorBanner}>Error: {historyError}</p>}

          <div className={styles.historyGrid}>
            <div className={styles.tableCard}>
              <h3>Payment Cases</h3>
              {paymentCases.length === 0 ? (
                <p className={styles.cardDesc}>ไม่มีข้อมูล</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Created</th>
                        <th>Case</th>
                        <th>Status</th>
                        <th>User</th>
                        <th>Amount</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentCases.map((item) => (
                        <tr key={item.id}>
                          <td>{new Date(item.created_at).toLocaleString()}</td>
                          <td>{item.case_type}</td>
                          <td>{item.status}</td>
                          <td title={item.user_id}><code>{item.user_id.slice(0, 8)}...</code></td>
                          <td>{Number(item.amount || 0).toLocaleString('th-TH')} {item.currency || 'THB'}</td>
                          <td title={item.reason}>{item.reason || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className={styles.tableCard}>
              <h3>Coin Transactions</h3>
              {coinTransactions.length === 0 ? (
                <p className={styles.cardDesc}>ไม่มีข้อมูล</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Created</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>User</th>
                        <th>Reference</th>
                        <th>Policy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coinTransactions.map((item) => (
                        <tr key={item.id}>
                          <td>{new Date(item.created_at).toLocaleString()}</td>
                          <td>{item.txn_type}</td>
                          <td>{Number(item.amount || 0).toLocaleString('th-TH')}</td>
                          <td title={item.user_id}><code>{item.user_id.slice(0, 8)}...</code></td>
                          <td title={`${item.reference_type || '-'}:${item.reference_id || '-'}`}>
                            {item.reference_type || '-'} / {item.reference_id ? `${item.reference_id.slice(0, 8)}...` : '-'}
                          </td>
                          <td>{item.policy_version || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
