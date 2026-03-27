'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCcw, Search, ShieldAlert, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import styles from './users.module.css';

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

type ApiResponse = {
  users?: AdminUserRow[];
  error?: string;
};

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function getVipLabel(value: string) {
  switch (value) {
    case 'active':
      return 'ใช้งานอยู่';
    case 'past_due':
      return 'ค้างชำระ';
    case 'canceled':
      return 'ยกเลิกแล้ว';
    default:
      return 'ไม่ได้ใช้งาน';
  }
}

export default function AdminUsersClient() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allowed, setAllowed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const fetchUsers = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setAllowed(false);
        setUsers([]);
        return;
      }

      const response = await fetch('/api/admin/users?limit=100', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = (await response.json()) as ApiResponse;

      if (response.status === 401 || response.status === 403) {
        setAllowed(false);
        setUsers([]);
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || 'ไม่สามารถดึงข้อมูลผู้ใช้ได้');
      }

      setAllowed(true);
      setUsers(data.users || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers(false);
  }, [fetchUsers]);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return users;

    return users.filter((item) => {
      const haystack = `${item.id} ${item.email || ''} ${item.penName || ''}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [query, users]);

  const activeVipCount = useMemo(() => users.filter((item) => item.vipStatus === 'active').length, [users]);

  if (loading) {
    return (
      <section className={styles.stateContainer}>
        <RefreshCcw className={styles.spin} />
        <p>กำลังโหลดรายชื่อผู้ใช้...</p>
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
          <h1>จัดการผู้ใช้</h1>
          <p>รายชื่อผู้ใช้ทั้งหมดในระบบ พร้อมยอดเหรียญและสถานะสมาชิก VIP</p>
        </div>

        <button
          type="button"
          onClick={() => void fetchUsers(true)}
          disabled={refreshing}
          className={styles.refreshButton}
        >
          <RefreshCcw size={16} className={refreshing ? styles.spin : ''} />
          {refreshing ? 'กำลังรีเฟรช...' : 'รีเฟรช'}
        </button>
      </header>

      <section className={styles.summary}>
        <div className={styles.summaryItem}>
          <Users size={18} />
          <span>ผู้ใช้ทั้งหมด {users.length.toLocaleString('th-TH')} คน</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.vipDot} />
          <span>VIP ที่ใช้งานอยู่ {activeVipCount.toLocaleString('th-TH')} คน</span>
        </div>
      </section>

      <section className={styles.filters}>
        <div className={styles.searchBox}>
          <Search size={16} />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาด้วยรหัสผู้ใช้, อีเมล หรือชื่อที่แสดง"
          />
        </div>
      </section>

      {error ? <p className={styles.errorBanner}>{error}</p> : null}

      <section className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ผู้ใช้</th>
              <th>เหรียญ</th>
              <th>VIP</th>
              <th>สมัครเมื่อ</th>
              <th>เข้าใช้งานล่าสุด</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  ไม่พบผู้ใช้ที่ตรงกับเงื่อนไข
                </td>
              </tr>
            ) : (
              filteredUsers.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className={styles.userCell}>
                      <div className={styles.avatar}>
                        {(item.penName || item.email || 'U').trim().charAt(0).toUpperCase()}
                      </div>
                      <div className={styles.userMeta}>
                        <p className={styles.userName}>{item.penName || 'ยังไม่ได้ตั้งชื่อ'}</p>
                        <p className={styles.userEmail}>{item.email || '-'}</p>
                        <p className={styles.userId}>{item.id}</p>
                      </div>
                    </div>
                  </td>
                  <td>{item.coinBalance.toLocaleString('th-TH')}</td>
                  <td>
                    <span className={`${styles.vipBadge} ${item.vipStatus === 'active' ? styles.vipActive : styles.vipInactive}`}>
                      {getVipLabel(item.vipStatus)}
                    </span>
                  </td>
                  <td>{formatDate(item.createdAt)}</td>
                  <td>{formatDate(item.lastSignInAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
