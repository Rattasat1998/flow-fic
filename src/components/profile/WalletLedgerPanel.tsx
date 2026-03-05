'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Wallet, History, ArrowDownRight, ArrowUpRight, RefreshCw, AlertTriangle } from 'lucide-react';
import styles from './wallet-ledger-panel.module.css';
import { supabase } from '@/lib/supabase';

type CoinTransactionRow = {
  id: string;
  amount: number;
  txn_type: string;
  description: string | null;
  created_at: string;
};

type WalletLedgerPanelProps = {
  userId: string | null | undefined;
};

const HISTORY_LIMIT = 30;

function formatTxnType(txnType: string): string {
  switch (txnType) {
    case 'stripe_topup':
      return 'เติมเหรียญ';
    case 'chapter_unlock':
      return 'ปลดล็อกตอนพิเศษ';
    case 'admin_adjust':
      return 'ปรับยอดโดยระบบ';
    default:
      return txnType;
  }
}

function formatTxnDate(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSignedAmount(amount: number): string {
  const sign = amount >= 0 ? '+' : '-';
  return `${sign}${Math.abs(amount).toLocaleString('th-TH')} เหรียญ`;
}

export function WalletLedgerPanel({ userId }: WalletLedgerPanelProps) {
  const [coinBalance, setCoinBalance] = useState(0);
  const [walletBalanceRaw, setWalletBalanceRaw] = useState(0);
  const [transactions, setTransactions] = useState<CoinTransactionRow[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchWalletData = useCallback(async () => {
    setIsLoading(true);
    setHistoryError(null);

    if (!userId) {
      setCoinBalance(0);
      setWalletBalanceRaw(0);
      setTransactions([]);
      setIsLoading(false);
      return;
    }

    try {
      const fetchLedgerSum = async (targetUserId: string) => {
        const pageSize = 1000;
        let from = 0;
        let sum = 0;

        while (true) {
          const { data, error } = await supabase
            .from('coin_transactions')
            .select('amount')
            .eq('user_id', targetUserId)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(from, from + pageSize - 1);

          if (error) throw error;
          if (!data || data.length === 0) break;

          data.forEach((row) => {
            sum += Number(row.amount || 0);
          });

          if (data.length < pageSize) break;
          from += pageSize;
        }

        return sum;
      };

      const [
        { data: walletData, error: walletFetchError },
        { data: historyData, error: historyFetchError },
        ledgerSum,
      ] = await Promise.all([
        supabase
          .from('wallets')
          .select('coin_balance')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('coin_transactions')
          .select('id, amount, txn_type, description, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(HISTORY_LIMIT),
        fetchLedgerSum(userId),
      ]);

      if (walletFetchError) throw walletFetchError;
      if (historyFetchError) throw historyFetchError;

      setCoinBalance(ledgerSum);
      setWalletBalanceRaw(walletData?.coin_balance || 0);
      setTransactions((historyData || []) as CoinTransactionRow[]);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'โหลดประวัติธุรกรรมไม่สำเร็จ');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  const isBalanceConsistent = walletBalanceRaw === coinBalance;

  const historyWithRunningBalance = useMemo(() => {
    let running = coinBalance;
    return transactions.map((txn) => {
      const balanceAfter = running;
      running -= txn.amount;
      return {
        ...txn,
        balanceAfter,
      };
    });
  }, [transactions, coinBalance]);

  return (
    <section className={styles.walletLedgerSection}>
      <div className={styles.walletHeader}>
        <div className={styles.walletTitleWrap}>
          <h3>
            <Wallet size={18} />
            Wallet Ledger
          </h3>
          <p>ยอดคงเหลือจาก Ledger และประวัติธุรกรรมล่าสุด</p>
        </div>
        <button
          type="button"
          className={styles.refreshWalletBtn}
          onClick={fetchWalletData}
          disabled={isLoading}
        >
          <RefreshCw size={14} className={isLoading ? styles.spinIcon : ''} />
          รีเฟรชยอด
        </button>
      </div>

      <div className={styles.walletSummaryGrid}>
        <div className={styles.walletSummaryCard}>
          <div className={styles.walletSummaryLabel}>ยอดที่แสดง (Ledger)</div>
          <div className={styles.walletSummaryValue}>{coinBalance.toLocaleString('th-TH')} เหรียญ</div>
        </div>
        <div className={styles.walletSummaryCard}>
          <div className={styles.walletSummaryLabel}>ยอดในตาราง Wallets</div>
          <div className={styles.walletSummaryValue}>{walletBalanceRaw.toLocaleString('th-TH')} เหรียญ</div>
        </div>
        <div className={styles.walletSummaryCard}>
          <div className={styles.walletSummaryLabel}>สถานะความถูกต้อง</div>
          <div className={`${styles.walletSummaryValue} ${isBalanceConsistent ? styles.statusOk : styles.statusWarn}`}>
            {isBalanceConsistent ? 'ตรงกัน' : 'ไม่ตรงกัน'}
          </div>
        </div>
      </div>

      {!isBalanceConsistent && (
        <div className={styles.walletWarning}>
          <AlertTriangle size={16} />
          พบความต่างระหว่าง Wallet table กับ Ledger ตอนนี้ระบบจะแสดงยอดตาม Ledger ({coinBalance.toLocaleString('th-TH')} เหรียญ)
        </div>
      )}

      <div className={styles.historyListWrap}>
        <div className={styles.historyListHeader}>
          <h4>
            <History size={16} />
            ประวัติธุรกรรมล่าสุด
          </h4>
          <span>{historyWithRunningBalance.length} รายการ</span>
        </div>

        {isLoading ? (
          <div className={styles.historyLoading}>กำลังโหลดประวัติธุรกรรม...</div>
        ) : historyError ? (
          <div className={styles.historyError}>ไม่สามารถโหลดประวัติธุรกรรมได้: {historyError}</div>
        ) : historyWithRunningBalance.length === 0 ? (
          <div className={styles.historyEmpty}>ยังไม่มีประวัติธุรกรรมในบัญชีนี้</div>
        ) : (
          <div className={styles.historyRows}>
            {historyWithRunningBalance.map((txn) => {
              const isCredit = txn.amount >= 0;
              return (
                <article key={txn.id} className={styles.historyRow}>
                  <div className={styles.historyIcon}>
                    {isCredit ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                  </div>
                  <div className={styles.historyMain}>
                    <div className={styles.historyType}>{formatTxnType(txn.txn_type)}</div>
                    <div className={styles.historyMeta}>
                      <span>{formatTxnDate(txn.created_at)}</span>
                      {txn.description && <span>{txn.description}</span>}
                    </div>
                  </div>
                  <div className={styles.historyAmountWrap}>
                    <div className={`${styles.historyAmount} ${isCredit ? styles.credit : styles.debit}`}>
                      {formatSignedAmount(txn.amount)}
                    </div>
                    <div className={styles.historyBalanceAfter}>คงเหลือ {txn.balanceAfter.toLocaleString('th-TH')}</div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
