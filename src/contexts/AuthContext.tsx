'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AuthChangeEvent, User, Session } from '@supabase/supabase-js';

interface AuthContextType {
    user: User | null;
    session: Session | null;
    isLoading: boolean;
    signInWithFacebook: () => Promise<void>;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function isSameSessionSnapshot(current: Session | null, next: Session | null): boolean {
    if (!current && !next) return true;
    if (!current || !next) return false;

    return current.user.id === next.user.id
        && current.access_token === next.access_token
        && current.refresh_token === next.refresh_token
        && current.expires_at === next.expires_at;
}

function shouldRecoverFromSessionError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    return message.includes('refresh token')
        || message.includes('invalid_grant')
        || message.includes('session')
        || message.includes('jwt');
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // 1. Get initial session
        const initializeAuth = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();
                if (error) throw error;

                setSession(session);
                setUser(session?.user ?? null);
            } catch (error) {
                console.warn('Error fetching auth session:', error);
                setSession(null);
                setUser(null);

                if (shouldRecoverFromSessionError(error)) {
                    try {
                        await supabase.auth.signOut({ scope: 'local' });
                    } catch {
                        // ignore local cleanup errors
                    }
                }
            } finally {
                setIsLoading(false);
            }
        };

        initializeAuth();

        // 2. Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event: AuthChangeEvent, nextSession) => {
                const nextUser = nextSession?.user ?? null;
                const shouldPreserveUserIdentity = event !== 'USER_UPDATED';

                setSession((currentSession) => (
                    isSameSessionSnapshot(currentSession, nextSession) ? currentSession : nextSession
                ));
                setUser((currentUser) => {
                    if (
                        shouldPreserveUserIdentity
                        && currentUser?.id
                        && nextUser?.id === currentUser.id
                    ) {
                        return currentUser;
                    }

                    return nextUser;
                });
                setIsLoading(false);
            }
        );

        // Cleanup subscription on unmount
        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const getOAuthRedirectUrl = useCallback(() => {
        if (typeof window === 'undefined') return undefined;
        return `${window.location.origin}/auth/callback`;
    }, []);

    const signInWithFacebook = useCallback(async () => {
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'facebook',
                options: {
                    redirectTo: getOAuthRedirectUrl(),
                    scopes: 'email,public_profile',
                },
            });
            if (error) throw error;
        } catch (error) {
            console.error('Error signing in with Facebook:', error);
            throw error;
        }
    }, [getOAuthRedirectUrl]);

    const signInWithGoogle = useCallback(async () => {
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: getOAuthRedirectUrl(),
                },
            });
            if (error) throw error;
        } catch (error) {
            console.error('Error signing in with Google:', error);
            throw error;
        }
    }, [getOAuthRedirectUrl]);

    const signOut = useCallback(async () => {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
        } catch (error) {
            console.error('Error signing out:', error);
            throw error;
        }
    }, []);

    const value = useMemo(() => ({
        user,
        session,
        isLoading,
        signInWithFacebook,
        signInWithGoogle,
        signOut,
    }), [user, session, isLoading, signInWithFacebook, signInWithGoogle, signOut]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
