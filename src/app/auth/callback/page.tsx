'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const normalizeNextPath = (value: string | null): string => {
    if (!value) return '/';
    if (!value.startsWith('/')) return '/';
    if (value.startsWith('//')) return '/';
    return value;
};

function AuthCallbackContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        const handleAuthCallback = async () => {
            const providerError = searchParams.get('error_description') || searchParams.get('error');
            if (providerError) {
                setErrorMessage(decodeURIComponent(providerError));
                return;
            }

            const nextFromQuery = normalizeNextPath(searchParams.get('next'));
            const nextFromSession = typeof window !== 'undefined'
                ? normalizeNextPath(window.sessionStorage.getItem('oauth_next_path'))
                : '/';
            const redirectPath = nextFromQuery !== '/' ? nextFromQuery : nextFromSession;

            const code = searchParams.get('code');
            if (code) {
                const { error } = await supabase.auth.exchangeCodeForSession(code);
                if (error) {
                    setErrorMessage(error.message);
                    return;
                }
            }

            if (typeof window !== 'undefined') {
                window.sessionStorage.removeItem('oauth_next_path');
            }

            router.replace(redirectPath);
        };

        handleAuthCallback();
    }, [router, searchParams]);

    if (errorMessage) {
        return (
            <main style={{ maxWidth: '720px', margin: '0 auto', padding: '48px 20px' }}>
                <h1>Login failed</h1>
                <p style={{ color: '#b00020' }}>{errorMessage}</p>
                <p>Please check your Facebook/Supabase OAuth settings and try again.</p>
            </main>
        );
    }

    return (
        <main style={{ maxWidth: '720px', margin: '0 auto', padding: '48px 20px' }}>
            <h1>Signing you in...</h1>
            <p>Please wait.</p>
        </main>
    );
}

export default function AuthCallbackPage() {
    return (
        <Suspense
            fallback={
                <main style={{ maxWidth: '720px', margin: '0 auto', padding: '48px 20px' }}>
                    <h1>Signing you in...</h1>
                    <p>Please wait.</p>
                </main>
            }
        >
            <AuthCallbackContent />
        </Suspense>
    );
}
