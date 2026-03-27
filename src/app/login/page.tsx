'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, LogIn } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useTracking } from '@/hooks/useTracking';
import { supabase } from '@/lib/supabase';

import styles from './login.module.css';

const normalizeNextPath = (value: string | null): string => {
    if (!value) return '/';
    if (!value.startsWith('/')) return '/';
    if (value.startsWith('//')) return '/';
    return value;
};

const getLoginReasonCode = (error: unknown): string => {
    if (!(error instanceof Error)) return 'unknown';
    const normalizedMessage = error.message.toLowerCase();

    if (normalizedMessage.includes('กรอกอีเมลและรหัสผ่าน')) return 'validation';
    if (normalizedMessage.includes('invalid login credentials')) return 'invalid_credentials';
    if (normalizedMessage.includes('อีเมลหรือรหัสผ่านไม่ถูกต้อง')) return 'invalid_credentials';
    if (normalizedMessage.includes('too many requests')) return 'rate_limited';

    return 'unknown';
};

function LoginPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, isLoading: isLoadingAuth, signInWithFacebook } = useAuth();
    const { trackEvent } = useTracking({ autoPageView: true, pagePath: '/login' });

    const nextPath = useMemo(
        () => normalizeNextPath(searchParams.get('next')),
        [searchParams]
    );

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isFacebookSubmitting, setIsFacebookSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        if (isLoadingAuth) return;
        if (!user) return;
        router.replace(nextPath);
    }, [isLoadingAuth, nextPath, router, user]);

    const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (isSubmitting) return;

        setErrorMessage(null);
        setIsSubmitting(true);
        trackEvent('auth_login_attempt', '/login', {
            metadata: {
                method: 'password',
            },
        });

        try {
            const normalizedEmail = email.trim();
            if (!normalizedEmail || !password) {
                throw new Error('กรอกอีเมลและรหัสผ่านก่อนเข้าสู่ระบบ');
            }

            const { error } = await supabase.auth.signInWithPassword({
                email: normalizedEmail,
                password,
            });

            if (error) {
                if (error.message.toLowerCase().includes('invalid login credentials')) {
                    throw new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
                }
                throw error;
            }

            trackEvent('auth_login_success', '/login', {
                metadata: {
                    method: 'password',
                },
            });
            router.replace(nextPath);
        } catch (error) {
            trackEvent('auth_login_failed', '/login', {
                metadata: {
                    method: 'password',
                    reason_code: getLoginReasonCode(error),
                },
            });
            const message = error instanceof Error ? error.message : 'ไม่สามารถเข้าสู่ระบบได้ในขณะนี้';
            setErrorMessage(message);
        } finally {
            setIsSubmitting(false);
        }
    }, [email, isSubmitting, nextPath, password, router, trackEvent]);

    const handleFacebookSignIn = useCallback(async () => {
        if (isFacebookSubmitting || isSubmitting || isLoadingAuth) return;

        setErrorMessage(null);
        setIsFacebookSubmitting(true);
        trackEvent('auth_oauth_start', '/login', {
            metadata: {
                provider: 'facebook',
            },
        });

        try {
            await signInWithFacebook(nextPath);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'ไม่สามารถเข้าสู่ระบบด้วย Facebook ได้ในขณะนี้';
            setErrorMessage(message);
        } finally {
            setIsFacebookSubmitting(false);
        }
    }, [isFacebookSubmitting, isLoadingAuth, isSubmitting, nextPath, signInWithFacebook, trackEvent]);

    return (
        <main className={styles.main}>
            <div className={styles.card}>
                <div className={styles.brand}>FlowFic</div>
                <h1 className={styles.title}>เข้าสู่ระบบ FlowFic</h1>
                <p className={styles.subtitle}>ใช้อีเมลและรหัสผ่านเพื่อเข้าใช้งานชั้นหนังสือ การติดตาม และแดชบอร์ดนักเขียน</p>

                <button
                    type="button"
                    className={styles.facebookBtn}
                    onClick={() => void handleFacebookSignIn()}
                    disabled={isFacebookSubmitting || isSubmitting || isLoadingAuth}
                >
                    {isFacebookSubmitting ? <Loader2 size={16} className={styles.spinner} /> : null}
                    {isFacebookSubmitting ? 'กำลังเชื่อมต่อ Facebook...' : 'เข้าสู่ระบบด้วย Facebook'}
                </button>

                <div className={styles.divider}>
                    <span>หรือ</span>
                </div>

                <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
                    <label className={styles.field}>
                        <span>อีเมล</span>
                        <input
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="you@example.com"
                            required
                        />
                    </label>

                    <label className={styles.field}>
                        <span>รหัสผ่าน</span>
                        <input
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </label>

                    {errorMessage && <p className={styles.error}>{errorMessage}</p>}

                    <button type="submit" className={styles.submit} disabled={isSubmitting || isLoadingAuth}>
                        {isSubmitting ? <Loader2 size={16} className={styles.spinner} /> : <LogIn size={16} />}
                        {isSubmitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
                    </button>
                </form>

                <div className={styles.footer}>
                    <Link href="/" className={styles.link}>
                        กลับหน้าแรก
                    </Link>
                </div>
            </div>
        </main>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<main className={styles.main} />}>
            <LoginPageContent />
        </Suspense>
    );
}
