'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, Clock3, Wallet, AlertTriangle, Landmark, RefreshCw, CircleHelp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTracking } from '@/hooks/useTracking';
import styles from './writer-earnings-panel.module.css';

type WriterEarningsPanelProps = {
  userId: string | null | undefined;
};

type SummaryResponse = {
  success: boolean;
  balance: {
    pendingSatang: number;
    availableSatang: number;
    reservedSatang: number;
    paidSatang: number;
    debtSatang: number;
    updatedAt: string;
  };
  profile: {
    legalName: string | null;
    promptpayTarget: string | null;
    kycStatus: 'pending' | 'verified' | 'rejected';
    kycRejectionReason: string | null;
    verifiedAt: string | null;
  } | null;
  policy: {
    baseRateSatangPerCoin: number;
    creatorShareBps: number;
    holdDays: number;
    withholdingBps: number;
    minPayoutSatang: number;
  };
  canRequestPayout: boolean;
};

type StatementResponse = {
  success: boolean;
  statement: Array<{
    eventId: string;
    eventType: string;
    createdAt: string;
    storyTitle: string | null;
    chapterTitle: string | null;
    coins: number;
    writerShareSatang: number;
  }>;
};

type HistoryResponse = {
  success: boolean;
  history: Array<{
    id: string;
    status: string;
    grossSatang: number;
    withholdingSatang: number;
    netSatang: number;
    requestedAt: string;
    paidAt: string | null;
    rejectReason: string | null;
  }>;
};

function formatThb(satang: number) {
  return (satang / 100).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatThbAmount(amountThb: number, maximumFractionDigits = 3) {
  return amountThb.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits,
  });
}

function formatCoinAmount(coins: number) {
  return coins.toLocaleString('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function getActiveAccessToken(forceRefresh = false) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  let session = sessionData.session || null;
  const isNearExpiry = !!session?.expires_at && session.expires_at * 1000 <= Date.now() + 15_000;

  if (forceRefresh || isNearExpiry) {
    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    }
    session = refreshedData.session || null;
  }

  if (!session?.access_token) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    throw new Error('ไม่พบเซสชันผู้ใช้ กรุณาเข้าสู่ระบบใหม่');
  }

  return session.access_token;
}

async function fetchApi<T>(path: string, init?: RequestInit, accessToken?: string): Promise<T> {
  const executeFetch = async (token: string) => fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });

  const baseToken = accessToken || (await getActiveAccessToken());
  let token = baseToken;
  let response = await executeFetch(token);

  if (response.status === 401) {
    const refreshedToken = await getActiveAccessToken(true);
    if (refreshedToken !== token) {
      token = refreshedToken;
      response = await executeFetch(token);
    } else if (accessToken) {
      // Force one retry even if token text is unchanged (server-side revocation race).
      response = await executeFetch(token);
    }
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }

  return payload as T;
}

export function WriterEarningsPanel({ userId }: WriterEarningsPanelProps) {
  const { trackEvent } = useTracking();
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [statement, setStatement] = useState<StatementResponse['statement']>([]);
  const [history, setHistory] = useState<HistoryResponse['history']>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving'>('idle');
  const [requestState, setRequestState] = useState<'idle' | 'submitting'>('idle');

  const [legalName, setLegalName] = useState('');
  const [promptpayTarget, setPromptpayTarget] = useState('');
  const [requestAmountThb, setRequestAmountThb] = useState('');

  const fetchPanelData = useCallback(async () => {
    if (!userId) {
      setSummary(null);
      setStatement([]);
      setHistory([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const accessToken = await getActiveAccessToken();
      const [summaryRes, statementRes, historyRes] = await Promise.all([
        fetchApi<SummaryResponse>('/api/writer/earnings/summary', undefined, accessToken),
        fetchApi<StatementResponse>('/api/writer/earnings/statement?page=1&pageSize=20', undefined, accessToken),
        fetchApi<HistoryResponse>('/api/writer/payouts/history?limit=10', undefined, accessToken),
      ]);

      setSummary(summaryRes);
      setStatement(statementRes.statement || []);
      setHistory(historyRes.history || []);

      setLegalName(summaryRes.profile?.legalName || '');
      setPromptpayTarget(summaryRes.profile?.promptpayTarget || '');

      trackEvent('writer_earnings_view', '/dashboard', {
        metadata: {
          kyc_status: summaryRes.profile?.kycStatus || 'none',
        },
      });
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'โหลดข้อมูลรายได้ไม่สำเร็จ');
    } finally {
      setIsLoading(false);
    }
  }, [trackEvent, userId]);

  useEffect(() => {
    fetchPanelData();
  }, [fetchPanelData]);

  const handleSaveProfile = async () => {
    setSaveState('saving');
    setError(null);
    try {
      await fetchApi('/api/writer/payout-profile', {
        method: 'POST',
        body: JSON.stringify({
          legalName,
          promptpayTarget,
        }),
      });
      await fetchPanelData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'บันทึกโปรไฟล์ไม่สำเร็จ');
    } finally {
      setSaveState('idle');
    }
  };

  const handleRequestPayout = async () => {
    setRequestState('submitting');
    setError(null);

    const amountNumber = Number(requestAmountThb || 0);
    const amountSatang = Number.isFinite(amountNumber) && amountNumber > 0
      ? Math.floor(amountNumber * 100)
      : null;

    try {
      const payload = await fetchApi<{ success: boolean; payoutRequestId: string }>('/api/writer/payouts/request', {
        method: 'POST',
        body: JSON.stringify({
          amountSatang,
        }),
      });

      trackEvent('writer_payout_request', '/dashboard', {
        metadata: {
          payout_request_id: payload.payoutRequestId,
          amount_satang: amountSatang,
        },
      });

      setRequestAmountThb('');
      await fetchPanelData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'ยื่นถอนเงินไม่สำเร็จ');
    } finally {
      setRequestState('idle');
    }
  };

  const minPayoutThb = useMemo(() => formatThb(summary?.policy.minPayoutSatang || 30000), [summary]);
  const baseRateSatangPerCoin = summary?.policy.baseRateSatangPerCoin || 15;
  const creatorShareBps = summary?.policy.creatorShareBps || 7000;
  const holdDays = summary?.policy.holdDays || 14;
  const withholdingBps = summary?.policy.withholdingBps || 300;
  const writerRateSatangPerCoin = (baseRateSatangPerCoin * creatorShareBps) / 10000;
  const writerRateThbPerCoin = writerRateSatangPerCoin / 100;
  const pendingSatang = summary?.balance.pendingSatang || 0;
  const availableSatang = summary?.balance.availableSatang || 0;
  const pendingCoinEquivalent = writerRateSatangPerCoin > 0 ? Math.max(0, pendingSatang) / writerRateSatangPerCoin : 0;
  const availableCoinEquivalent = writerRateSatangPerCoin > 0 ? Math.max(0, availableSatang) / writerRateSatangPerCoin : 0;
  const withdrawableGrossSatang = Math.max(0, availableSatang);
  const withdrawableNetSatang = Math.floor((withdrawableGrossSatang * (10000 - withholdingBps)) / 10000);

  if (!userId) {
    return null;
  }

  return (
    <section className={styles.section}>
      <div className={styles.headerRow}>
        <div>
          <h2>รายได้นักเขียน</h2>
          <p>ยอดรายได้จากการปลดล็อกตอนพรีเมียมด้วยเหรียญ และการถอนผ่าน PromptPay</p>
        </div>
        <button type="button" className={styles.refreshBtn} onClick={fetchPanelData} disabled={isLoading}>
          <RefreshCw size={14} className={isLoading ? styles.spinIcon : ''} />
          รีเฟรช
        </button>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className={styles.infoBox}>
        <p className={styles.infoTitle}>เงื่อนไขการนับรายได้</p>
        <ul className={styles.infoList}>
          <li>ระบบนับรายได้เมื่อผู้อ่านใช้ coin ปลดล็อกตอนพรีเมียมเท่านั้น</li>
          <li>การเติม coin เข้าวอลเล็ตยังไม่ถือเป็นรายได้ จนกว่าจะมีการปลดล็อกตอน</li>
          <li>ยอดที่เพิ่งปลดล็อกจะเข้า Pending ก่อน และย้ายเป็น Available หลังครบ {holdDays} วัน</li>
          <li>ระบบ v1 เริ่มนับรายได้ตั้งแต่วันที่ 28 มีนาคม 2026 และไม่ backfill รายการก่อนหน้านั้น</li>
        </ul>
      </div>

      <div className={styles.cardsGrid}>
        <article className={styles.card}>
          <div className={styles.cardLabel}>
            <Clock3 size={16} /> Pending
            <span
              className={styles.statusTooltip}
              tabIndex={0}
              data-tooltip={`ยอดที่รอครบระยะ hold ${holdDays} วันก่อนย้ายเป็น Available`}
              title={`ยอดที่รอครบระยะ hold ${holdDays} วันก่อนย้ายเป็น Available`}
              aria-label={`คำอธิบายสถานะ Pending: รอครบระยะ hold ${holdDays} วันก่อนย้ายเป็น Available`}
            >
              <CircleHelp size={13} />
            </span>
          </div>
          <div className={styles.cardValue}>฿{formatThb(pendingSatang)}</div>
          <div className={styles.cardHint}>≈ {formatCoinAmount(pendingCoinEquivalent)} coin (รอครบระยะ hold {holdDays} วัน)</div>
        </article>
        <article className={styles.card}>
          <div className={styles.cardLabel}>
            <Wallet size={16} /> Available
            <span
              className={styles.statusTooltip}
              tabIndex={0}
              data-tooltip="ยอดที่ถอนเงินได้ โดยต้องผ่านเงื่อนไข KYC และยอดขั้นต่ำ"
              title="ยอดที่ถอนเงินได้ โดยต้องผ่านเงื่อนไข KYC และยอดขั้นต่ำ"
              aria-label="คำอธิบายสถานะ Available: ยอดที่ถอนเงินได้เมื่อผ่านเงื่อนไข"
            >
              <CircleHelp size={13} />
            </span>
          </div>
          <div className={styles.cardValue}>฿{formatThb(availableSatang)}</div>
          <div className={styles.cardHint}>≈ {formatCoinAmount(availableCoinEquivalent)} coin | ถอนได้สุทธิ ~฿{formatThb(withdrawableNetSatang)}</div>
        </article>
        <article className={styles.card}>
          <div className={styles.cardLabel}>
            <Coins size={16} /> Debt
            <span
              className={styles.statusTooltip}
              tabIndex={0}
              data-tooltip="หนี้จาก chargeback/debit จะถูกหักจากรายได้รอบถัดไปก่อน"
              title="หนี้จาก chargeback/debit จะถูกหักจากรายได้รอบถัดไปก่อน"
              aria-label="คำอธิบายสถานะ Debt: หนี้ที่ต้องถูกหักจากรายได้รอบถัดไป"
            >
              <CircleHelp size={13} />
            </span>
          </div>
          <div className={styles.cardValue}>฿{formatThb(summary?.balance.debtSatang || 0)}</div>
          <div className={styles.cardHint}>จะหักจากรายได้รอบถัดไปอัตโนมัติ</div>
        </article>
        <article className={styles.card}>
          <div className={styles.cardLabel}>
            <Landmark size={16} /> Paid
            <span
              className={styles.statusTooltip}
              tabIndex={0}
              data-tooltip="ยอดที่แอดมินโอนให้ผู้เขียนเรียบร้อยแล้ว"
              title="ยอดที่แอดมินโอนให้ผู้เขียนเรียบร้อยแล้ว"
              aria-label="คำอธิบายสถานะ Paid: ยอดที่โอนให้ผู้เขียนแล้ว"
            >
              <CircleHelp size={13} />
            </span>
          </div>
          <div className={styles.cardValue}>฿{formatThb(summary?.balance.paidSatang || 0)}</div>
          <div className={styles.cardHint}>ยอดที่โอนแล้วทั้งหมด</div>
        </article>
      </div>

      <div className={styles.panelGrid}>
        <section className={styles.panel}>
          <h3>ตั้งค่า PromptPay / KYC</h3>
          <div className={styles.formGroup}>
            <label>ชื่อ-นามสกุล (ตามบัญชีรับเงิน)</label>
            <input
              className={styles.input}
              value={legalName}
              onChange={(event) => setLegalName(event.target.value)}
              placeholder="ชื่อ-นามสกุล"
            />
          </div>
          <div className={styles.formGroup}>
            <label>PromptPay (เบอร์โทร/เลขบัตร/Wallet ID)</label>
            <input
              className={styles.input}
              value={promptpayTarget}
              onChange={(event) => setPromptpayTarget(event.target.value)}
              placeholder="089xxxxxxx"
            />
          </div>
          <p className={styles.metaText}>
            สถานะ KYC: <strong>{summary?.profile?.kycStatus || 'ยังไม่ตั้งค่า'}</strong>
            {summary?.profile?.kycRejectionReason ? ` (${summary.profile.kycRejectionReason})` : ''}
          </p>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleSaveProfile}
            disabled={saveState !== 'idle'}
          >
            {saveState === 'saving' ? 'กำลังบันทึก...' : 'บันทึกข้อมูลรับเงิน'}
          </button>
        </section>

        <section className={styles.panel}>
          <h3>ยื่นถอนเงิน</h3>
          <p className={styles.metaText}>
            ถอนได้ตอนนี้: ฿{formatThb(withdrawableGrossSatang)} (สุทธิ ~฿{formatThb(withdrawableNetSatang)} หลังหักภาษี {(withholdingBps / 100).toLocaleString('th-TH')}%) | ขั้นต่ำ ฿{minPayoutThb}
          </p>
          <div className={styles.formGroup}>
            <label>จำนวนที่ต้องการถอน (บาท) - เว้นว่างเพื่อถอนทั้งหมดที่ถอนได้</label>
            <input
              className={styles.input}
              type="number"
              min={0}
              step="0.01"
              value={requestAmountThb}
              onChange={(event) => setRequestAmountThb(event.target.value)}
              placeholder="เช่น 500"
            />
          </div>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleRequestPayout}
            disabled={requestState !== 'idle' || !summary?.canRequestPayout}
          >
            {requestState === 'submitting' ? 'กำลังส่งคำขอ...' : 'ยื่นคำขอถอนเงิน'}
          </button>
          {!summary?.canRequestPayout && (
            <p className={styles.metaText}>
              ยังไม่พร้อมถอน: ต้อง KYC = verified, มี PromptPay และยอด Available ถึงขั้นต่ำ รวมถึงไม่มีหนี้ค้าง
            </p>
          )}
        </section>
      </div>

      <div className={styles.tablesGrid}>
        <section className={styles.tablePanel}>
          <h3>Statement ล่าสุด</h3>
          {isLoading ? (
            <div className={styles.loadingState}>กำลังโหลด...</div>
          ) : statement.length === 0 ? (
            <div className={styles.emptyState}>ยังไม่มีรายการรายได้ (รายได้จะเกิดเมื่อผู้อ่านใช้ coin ปลดล็อกตอนพรีเมียม)</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>เวลา</th>
                    <th>รายการ</th>
                    <th>เรื่อง/ตอน</th>
                    <th>เหรียญ → บาท</th>
                    <th>ยอดสุทธิ</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.map((item) => (
                    <tr key={item.eventId}>
                      <td>{formatDateTime(item.createdAt)}</td>
                      <td>{item.eventType}</td>
                      <td>{item.storyTitle || '-'}{item.chapterTitle ? ` / ${item.chapterTitle}` : ''}</td>
                      <td>
                        {item.coins === 0 ? (
                          '-'
                        ) : (
                          <>
                            {item.coins.toLocaleString('th-TH')} coin
                            <div className={styles.tableSubText}>
                              ~฿{formatThbAmount(Math.abs(item.coins) * writerRateThbPerCoin)}
                            </div>
                          </>
                        )}
                      </td>
                      <td className={item.writerShareSatang >= 0 ? styles.amountPlus : styles.amountMinus}>
                        {item.writerShareSatang >= 0 ? '+' : '-'}฿{formatThb(Math.abs(item.writerShareSatang))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={styles.tablePanel}>
          <h3>ประวัติคำขอถอน</h3>
          {isLoading ? (
            <div className={styles.loadingState}>กำลังโหลด...</div>
          ) : history.length === 0 ? (
            <div className={styles.emptyState}>ยังไม่มีคำขอถอนเงิน</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>เวลา</th>
                    <th>สถานะ</th>
                    <th>Gross</th>
                    <th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDateTime(item.requestedAt)}</td>
                      <td>{item.status}</td>
                      <td>฿{formatThb(item.grossSatang)}</td>
                      <td>฿{formatThb(item.netSatang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
