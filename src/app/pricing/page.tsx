'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Sparkles, Coins, Zap } from 'lucide-react';
import styles from './pricing.module.css';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { COIN_PACKAGES, VIP_MONTHLY_PRICE_THB, getCoinPackageTotalCoins } from '@/lib/monetization';

type VipEntitlementRow = {
    status: string;
    current_period_end: string | null;
};

function PricingContent() {
    const { user, session } = useAuth();
    const searchParams = useSearchParams();

    const [coinBalance, setCoinBalance] = useState(0);
    const [vipEntitlement, setVipEntitlement] = useState<VipEntitlementRow | null>(null);
    const [isLoadingEntitlement, setIsLoadingEntitlement] = useState(true);
    const [checkoutError, setCheckoutError] = useState<string | null>(null);
    const [isCheckoutLoading, setIsCheckoutLoading] = useState<string | null>(null);

    useEffect(() => {
        const fetchEntitlement = async () => {
            setIsLoadingEntitlement(true);
            if (!user) {
                setCoinBalance(0);
                setVipEntitlement(null);
                setIsLoadingEntitlement(false);
                return;
            }

            const [{ data: walletData }, { data: vipData }] = await Promise.all([
                supabase
                    .from('wallets')
                    .select('coin_balance')
                    .eq('user_id', user.id)
                    .maybeSingle(),
                supabase
                    .from('vip_entitlements')
                    .select('status, current_period_end')
                    .eq('user_id', user.id)
                    .maybeSingle(),
            ]);

            setCoinBalance(walletData?.coin_balance || 0);
            setVipEntitlement((vipData as VipEntitlementRow | null) || null);
            setIsLoadingEntitlement(false);
        };

        fetchEntitlement();
    }, [user]);

    const isVipActive = useMemo(() => {
        if (!vipEntitlement) return false;
        if (vipEntitlement.status !== 'active') return false;
        if (!vipEntitlement.current_period_end) return true;
        return new Date(vipEntitlement.current_period_end).getTime() > Date.now();
    }, [vipEntitlement]);

    const checkoutStatus = searchParams.get('checkout');
    const functionsBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`
        : null;

    const startCheckout = async (payload: { kind: 'coins' | 'vip'; packageId?: string }, loadingKey: string) => {
        if (!session?.access_token || !user) {
            alert('กรุณาเข้าสู่ระบบก่อนทำรายการ');
            return;
        }

        setCheckoutError(null);
        setIsCheckoutLoading(loadingKey);
        try {
            const edgeCheckoutUrl = functionsBaseUrl ? `${functionsBaseUrl}/stripe-checkout` : null;
            const baseHeaders: Record<string, string> = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
            };

            const requestBody = JSON.stringify(payload);
            let response: Response;

            if (edgeCheckoutUrl) {
                const edgeHeaders = { ...baseHeaders };
                if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
                    edgeHeaders.apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
                }

                try {
                    response = await fetch(edgeCheckoutUrl, {
                        method: 'POST',
                        headers: edgeHeaders,
                        body: requestBody,
                    });

                    if ([401, 403, 404].includes(response.status)) {
                        response = await fetch('/api/payments/checkout', {
                            method: 'POST',
                            headers: baseHeaders,
                            body: requestBody,
                        });
                    }
                } catch {
                    response = await fetch('/api/payments/checkout', {
                        method: 'POST',
                        headers: baseHeaders,
                        body: requestBody,
                    });
                }
            } else {
                response = await fetch('/api/payments/checkout', {
                    method: 'POST',
                    headers: baseHeaders,
                    body: requestBody,
                });
            }

            const result = (await response.json()) as { checkoutUrl?: string; error?: string };
            if (!response.ok || !result.checkoutUrl) {
                throw new Error(result.error || 'สร้างลิงก์ชำระเงินไม่สำเร็จ');
            }

            window.location.href = result.checkoutUrl;
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
                    <p>สนับสนุนนักเขียนและปลดล็อกประสบการณ์แชทกับ AI แบบไร้ขีดจำกัด</p>
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

                        <p className={styles.vipDesc}>คุยกับทุกตัวละคร AI ได้เต็มอิ่มทะลุขีดจำกัด!</p>

                        <ul className={styles.featureList}>
                            <li>
                                <div className={styles.featureIcon}><Check size={16} /></div>
                                <span>แชทโต้ตอบกับ AI ได้ <strong>ไม่จำกัดจำนวนข้อความ</strong> (ปกติฟรี 10 ข้อความ/วัน)</span>
                            </li>
                            <li>
                                <div className={styles.featureIcon}><Check size={16} /></div>
                                <span>ฟีเจอร์ <Zap size={14} className={styles.inlineIcon} /> <strong>AI Voice Call</strong> โทรคุยกับตัวละครด้วยเสียงจริง</span>
                            </li>
                            <li>
                                <div className={styles.featureIcon}><Check size={16} /></div>
                                <span>ไม่มีโฆษณาคั่นระหว่างต่อบทแชท</span>
                            </li>
                            <li>
                                <div className={styles.featureIcon}><Check size={16} /></div>
                                <span>นักเขียนที่สร้าง AI ตัวนั้น จะได้รับส่วนแบ่งรายได้จาก VIP ของคุณ!</span>
                            </li>
                        </ul>

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
                        <p>ใช้สำหรับปลดล็อกตอนพิเศษ (NC, ตอนจบลับ) หรือส่งของขวัญให้ผู้แต่ง</p>
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

                                <button
                                    className={styles.purchaseBtn}
                                    onClick={() => startCheckout({ kind: 'coins', packageId: pkg.id }, `coins-${pkg.id}`)}
                                    disabled={isCheckoutLoading !== null}
                                >
                                    {isCheckoutLoading === `coins-${pkg.id}` ? 'กำลังสร้างรายการ...' : `฿${pkg.priceThb}`}
                                </button>
                            </div>
                        ))}
                    </div>
                </section>

                {(checkoutStatus === 'success' || checkoutStatus === 'cancel' || checkoutError) && (
                    <section style={{ marginTop: '-1rem', textAlign: 'center', color: checkoutStatus === 'success' ? '#15803d' : '#b91c1c' }}>
                        {checkoutStatus === 'success' && <p>ชำระเงินสำเร็จ ระบบกำลังอัปเดตสิทธิ์ของคุณ</p>}
                        {checkoutStatus === 'cancel' && <p>คุณยกเลิกรายการชำระเงินแล้ว</p>}
                        {checkoutError && <p>{checkoutError}</p>}
                    </section>
                )}

            </div>
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
