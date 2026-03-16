'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Sparkles, Coins } from 'lucide-react';
import styles from './pricing.module.css';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { COIN_PACKAGES, VIP_MONTHLY_PRICE_THB, getCoinPackageTotalCoins } from '@/lib/monetization';
import { useTracking } from '@/hooks/useTracking';

type VipEntitlementRow = {
    status: string;
    current_period_end: string | null;
};

type CoinPaymentMethod = 'card' | 'promptpay';

function PricingContent() {
    const { user } = useAuth();
    const userId = user?.id ?? null;
    const searchParams = useSearchParams();
    useTracking({ autoPageView: true, pagePath: '/pricing' });

    const [coinBalance, setCoinBalance] = useState(0);
    const [vipEntitlement, setVipEntitlement] = useState<VipEntitlementRow | null>(null);
    const [isLoadingEntitlement, setIsLoadingEntitlement] = useState(true);
    const [checkoutError, setCheckoutError] = useState<string | null>(null);
    const [isCheckoutLoading, setIsCheckoutLoading] = useState<string | null>(null);
    const [checkoutDialogState, setCheckoutDialogState] = useState<'success' | 'failed' | null>(null);

    const checkoutStatus = searchParams.get('checkout');

    const fetchWalletData = useCallback(async () => {
        setIsLoadingEntitlement(true);

        if (!userId) {
            setCoinBalance(0);
            setVipEntitlement(null);
            setIsLoadingEntitlement(false);
            return;
        }

        try {
            const [
                { data: walletData, error: walletFetchError },
                { data: vipData, error: vipFetchError },
            ] = await Promise.all([
                supabase
                    .from('wallets')
                    .select('coin_balance')
                    .eq('user_id', userId)
                    .maybeSingle(),
                supabase
                    .from('vip_entitlements')
                    .select('status, current_period_end')
                    .eq('user_id', userId)
                    .maybeSingle(),
            ]);

            if (walletFetchError) throw walletFetchError;
            if (vipFetchError) throw vipFetchError;

            setCoinBalance(walletData?.coin_balance || 0);
            setVipEntitlement((vipData as VipEntitlementRow | null) || null);
        } catch (error) {
            console.error('Failed to fetch pricing wallet data:', error);
        } finally {
            setIsLoadingEntitlement(false);
        }
    }, [userId]);

    useEffect(() => {
        fetchWalletData();
        // Refresh after returning from Stripe checkout.
    }, [fetchWalletData, checkoutStatus]);

    useEffect(() => {
        if (checkoutStatus === 'success') {
            setCheckoutDialogState('success');
            return;
        }
        if (checkoutStatus === 'cancel' || checkoutError) {
            setCheckoutDialogState('failed');
            return;
        }
        setCheckoutDialogState(null);
    }, [checkoutStatus, checkoutError]);

    const isVipActive = useMemo(() => {
        if (!vipEntitlement) return false;
        if (vipEntitlement.status !== 'active') return false;
        if (!vipEntitlement.current_period_end) return true;
        return new Date(vipEntitlement.current_period_end).getTime() > Date.now();
    }, [vipEntitlement]);

    const startCheckout = async (
        payload: { kind: 'coins' | 'vip'; packageId?: string; paymentMethod?: CoinPaymentMethod },
        loadingKey: string
    ) => {
        if (!user) {
            alert('กรุณาเข้าสู่ระบบก่อนทำรายการ');
            return;
        }

        setCheckoutError(null);
        setIsCheckoutLoading(loadingKey);
        try {
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) {
                throw sessionError;
            }
            let activeSession = sessionData.session || null;
            if (activeSession?.expires_at && activeSession.expires_at * 1000 <= Date.now() + 15_000) {
                const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
                if (refreshError) {
                    throw refreshError;
                }
                activeSession = refreshedData.session || null;
            }

            if (!activeSession?.access_token) {
                throw new Error('ไม่พบเซสชันผู้ใช้ กรุณาเข้าสู่ระบบใหม่');
            }

            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
            if (!supabaseUrl || !supabaseAnonKey) {
                throw new Error('ระบบยังไม่พร้อมชำระเงิน: ขาดค่า Supabase environment');
            }

            const idempotencyKey = typeof window !== 'undefined' && window.crypto?.randomUUID
                ? window.crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

            const edgeCheckoutUrl = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/stripe-checkout`;
            const response = await fetch(edgeCheckoutUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    apikey: supabaseAnonKey,
                    Authorization: `Bearer ${activeSession.access_token}`,
                },
                body: JSON.stringify({ ...payload, idempotencyKey }),
            });

            let result: { checkoutUrl?: string; error?: string; code?: string } = {};
            try {
                result = (await response.json()) as { checkoutUrl?: string; error?: string; code?: string };
            } catch {
                result = {};
            }

            if (result.checkoutUrl) {
                window.location.href = result.checkoutUrl;
                return;
            }

            if (response.status === 401) {
                if (result.code) {
                    throw new Error(`เซสชันหมดอายุหรือไม่ถูกต้อง (${result.code}) กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่`);
                }
                throw new Error('เซสชันหมดอายุหรือไม่ถูกต้อง กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่');
            }

            if (result.error && result.code) {
                throw new Error(`${result.error} (${result.code})`);
            }
            throw new Error(result.error || 'สร้างลิงก์ชำระเงินไม่สำเร็จ');
        } catch (error) {
            setCheckoutError(error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการสร้างรายการชำระเงิน');
            setIsCheckoutLoading(null);
        }
    };

    return (
        <main className={styles.main}>
            <header className={styles.header}>
                <div className={styles.headerContent}>
                    <div className={styles.balanceBadge}>
                        <Coins size={16} className={styles.coinIcon} />
                        <span className={styles.balanceAmount}>
                            {isLoadingEntitlement ? 'กำลังโหลด...' : `${coinBalance.toLocaleString('th-TH')} เหรียญ`}
                        </span>
                    </div>
                </div>
            </header>

            <div className={styles.container}>
                <div className={styles.pageTitle}>
                    <h1>เติมเหรียญ & สมัครวีไอพี</h1>
                    <p>เติมเหรียญเพื่อปลดล็อกตอนพิเศษ หรือสมัคร VIP เพื่ออ่านตอนพรีเมียมได้ทันที</p>
                </div>

                {/* Subscription Section (The Killer Feature) */}
                <section className={styles.vipSection}>
                    <div className={styles.vipCard}>
                        <div className={styles.vipHeader}>
                            <div className={styles.vipTitleGroup}>
                                <Sparkles size={24} className={styles.vipIcon} />
                                <h2>FlowFic VIP Pass</h2>
                            </div>
                            <div className={styles.vipPrice}>
                                <span className={styles.currency}>฿</span>
                                <span className={styles.amount}>{VIP_MONTHLY_PRICE_THB}</span>
                                <span className={styles.period}>/เดือน</span>
                            </div>
                        </div>

                        <p className={styles.vipDesc}>สิทธิ์หลักของแพ็กเกจนี้คืออ่านตอนพรีเมียมแบบไม่ต้องใช้เหรียญ</p>

                        <ul className={styles.featureList}>
                            <li>
                                <div className={styles.featureIcon}><Check size={16} /></div>
                                <span>อ่านตอนที่ติดเหรียญได้ทันที เมื่อสถานะสมาชิกเป็น <strong>active</strong></span>
                            </li>
                            <li>
                                <div className={styles.featureIcon}><Check size={16} /></div>
                                <span>ปลดล็อกตอนพรีเมียมผ่าน VIP โดยไม่หักเหรียญจาก Wallet</span>
                            </li>
                            <li>
                                <div className={styles.featureIcon}><Check size={16} /></div>
                                <span>ต่ออายุรายเดือนผ่าน Stripe และระบบซิงก์สิทธิ์อัตโนมัติ</span>
                            </li>
                            <li>
                                <div className={styles.featureIcon}><Check size={16} /></div>
                                <span>มีสถานะสิทธิ์บนหน้า Pricing ให้ตรวจสอบได้แบบเรียลไทม์</span>
                            </li>
                        </ul>

                        <p className={styles.vipFootnote}>
                            หมายเหตุ: ฟีเจอร์แชทไม่จำกัด, AI Voice Call และสิทธิ์ไม่มีโฆษณา ยังไม่เปิดใช้งานในระบบปัจจุบัน
                        </p>

                        <button
                            className={styles.subscribeBtn}
                            onClick={() => startCheckout({ kind: 'vip' }, 'vip')}
                            disabled={isCheckoutLoading !== null}
                        >
                            {isVipActive
                                ? 'VIP ใช้งานอยู่'
                                : isCheckoutLoading === 'vip'
                                    ? 'กำลังสร้างรายการ...'
                                    : 'สมัคร VIP เลย!'}
                        </button>
                    </div>
                </section>

                <hr className={styles.divider} />

                {/* Coin Packages Section */}
                <section className={styles.coinsSection}>
                    <div className={styles.sectionTitle}>
                        <h2>เติมเหรียญ Flow Coins</h2>
                        <p>ใช้สำหรับปลดล็อกตอนพิเศษ (NC, ตอนจบลับ) หรือส่งของขวัญให้ผู้แต่ง รองรับทั้งบัตรและ QR PromptPay</p>
                    </div>

                    <div className={styles.coinsGrid}>
                        {COIN_PACKAGES.map((pkg) => (
                            <div key={pkg.id} className={`${styles.coinCard} ${pkg.popular ? styles.popularCard : ''}`}>
                                {pkg.popular && <div className={styles.popularBadge}>ยอดนิยม</div>}

                                <div className={styles.coinAmount}>
                                    <Coins size={28} className={styles.coinIconLg} />
                                    <h3>{getCoinPackageTotalCoins(pkg)}</h3>
                                </div>

                                {pkg.bonus > 0 ? (
                                    <div className={styles.bonusText}>+ โบนัส {pkg.bonus} เหรียญ</div>
                                ) : (
                                    <div className={styles.noBonus}>ไม่มีโบนัส</div>
                                )}

                                <div className={styles.purchaseActions}>
                                    <button
                                        className={styles.purchaseBtn}
                                        onClick={() => startCheckout(
                                            { kind: 'coins', packageId: pkg.id, paymentMethod: 'card' },
                                            `coins-${pkg.id}-card`
                                        )}
                                        disabled={isCheckoutLoading !== null}
                                    >
                                        {isCheckoutLoading === `coins-${pkg.id}-card` ? 'กำลังสร้างรายการ...' : `บัตร ฿${pkg.priceThb}`}
                                    </button>
                                    <button
                                        className={styles.purchaseBtnSecondary}
                                        onClick={() => startCheckout(
                                            { kind: 'coins', packageId: pkg.id, paymentMethod: 'promptpay' },
                                            `coins-${pkg.id}-promptpay`
                                        )}
                                        disabled={isCheckoutLoading !== null}
                                    >
                                        {isCheckoutLoading === `coins-${pkg.id}-promptpay` ? 'กำลังสร้าง QR...' : `QR PromptPay ฿${pkg.priceThb}`}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

            </div>

            {checkoutDialogState && (
                <div className={styles.checkoutDialogBackdrop} role="dialog" aria-modal="true" aria-labelledby="checkout-dialog-title">
                    <div className={styles.checkoutDialogCard}>
                        <h3 id="checkout-dialog-title" className={styles.checkoutDialogTitle}>
                            {checkoutDialogState === 'success' ? 'เติมเงินสำเร็จ' : 'เติมเงินไม่สำเร็จ'}
                        </h3>
                        <button
                            className={styles.checkoutDialogButton}
                            onClick={() => setCheckoutDialogState(null)}
                        >
                            ตกลง
                        </button>
                    </div>
                </div>
            )}
        </main>
    );
}

export default function PricingPage() {
    return (
        <Suspense fallback={<main className={styles.main} />}>
            <PricingContent />
        </Suspense>
    );
}
