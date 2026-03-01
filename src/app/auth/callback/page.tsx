'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

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

            const code = searchParams.get('code');
            if (code) {
                const { error } = await supabase.auth.exchangeCodeForSession(code);
                if (error) {
                    setErrorMessage(error.message);
                    return;
                }
            }

            router.replace('/');
        };

        handleAuthCallback();
    }, [router, searchParams]);

    if (errorMessage) {
        return (
            <main style={{ maxWidth: '720px', margin: '0 auto', padding: '48px 20px' }}>
                <h1>Login failed</h1>
                <p style={{ color: '#b00020' }}>{errorMessage}</p>
                <p>Please check your Facebook/Supabase OAuth settings and try again.</p>
                <Link href="/">Back to home</Link>
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
