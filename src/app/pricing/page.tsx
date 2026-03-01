'use client';

import Link from 'next/link';
import { ArrowLeft, Check, Sparkles, Coins, Zap } from 'lucide-react';
import styles from './pricing.module.css';

const COIN_PACKAGES = [
    { id: '1', coins: 50, price: 10, bonus: 0 },
    { id: '2', coins: 150, price: 29, bonus: 5 },
    { id: '3', coins: 300, price: 59, bonus: 20, popular: true },
    { id: '4', coins: 500, price: 99, bonus: 50 },
    { id: '5', coins: 1200, price: 229, bonus: 150 },
    { id: '6', coins: 3000, price: 549, bonus: 500 },
];

export default function PricingPage() {
    return (
        <main className={styles.main}>
            <header className={styles.header}>
                <div className={styles.headerContent}>
                    <Link href="/" className={styles.backBtn}>
                        <ArrowLeft size={20} /> กลับหน้าหลัก
                    </Link>
                    <div className={styles.balanceBadge}>
                        <Coins size={16} className={styles.coinIcon} />
                        <span className={styles.balanceAmount}>120 เหรียญ</span>
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
                                <span className={styles.amount}>99</span>
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

                        <button className={styles.subscribeBtn}>
                            สมัคร VIP เลย!
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
                                    <h3>{pkg.coins}</h3>
                                </div>

                                {pkg.bonus > 0 ? (
                                    <div className={styles.bonusText}>+ โบนัส {pkg.bonus} เหรียญ</div>
                                ) : (
                                    <div className={styles.noBonus}>ไม่มีโบนัส</div>
                                )}

                                <button className={styles.purchaseBtn}>
                                    ฿{pkg.price}
                                </button>
                            </div>
                        ))}
                    </div>
                </section>

            </div>
        </main>
    );
}
