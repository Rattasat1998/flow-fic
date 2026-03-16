'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface UseFollowOptions {
    storyId: string;
    userId: string | null | undefined;
    initialFollowerCount?: number;
    initialIsFollowing?: boolean;
}

interface UseFollowReturn {
    isFollowing: boolean;
    followerCount: number;
    toggleFollow: () => Promise<void>;
    isLoading: boolean;
}

export function useFollow({
    storyId,
    userId,
    initialFollowerCount,
    initialIsFollowing,
}: UseFollowOptions): UseFollowReturn {
    const hasInitialState = Number.isFinite(initialFollowerCount) || typeof initialIsFollowing === 'boolean';
    const [isFollowing, setIsFollowing] = useState(Boolean(initialIsFollowing));
    const [followerCount, setFollowerCount] = useState(
        Number.isFinite(initialFollowerCount) ? Math.max(0, Number(initialFollowerCount)) : 0
    );
    const [isLoading, setIsLoading] = useState(!hasInitialState);

    useEffect(() => {
        if (Number.isFinite(initialFollowerCount)) {
            setFollowerCount(Math.max(0, Number(initialFollowerCount)));
        } else {
            setFollowerCount(0);
        }

        if (typeof initialIsFollowing === 'boolean') {
            setIsFollowing(initialIsFollowing);
        } else {
            setIsFollowing(false);
        }

        setIsLoading(!(Number.isFinite(initialFollowerCount) || typeof initialIsFollowing === 'boolean'));
    }, [storyId, userId, initialFollowerCount, initialIsFollowing]);

    // Fetch initial state
    useEffect(() => {
        if (!storyId) return;
        let cancelled = false;

        const fetchFollowState = async () => {
            if (!(Number.isFinite(initialFollowerCount) || typeof initialIsFollowing === 'boolean')) {
                setIsLoading(true);
            }

            // Get follower count
            const { count } = await supabase
                .from('follows')
                .select('*', { count: 'exact', head: true })
                .eq('story_id', storyId);

            if (cancelled) return;

            setFollowerCount(count || 0);

            // Check if current user follows this story
            if (userId) {
                const { data } = await supabase
                    .from('follows')
                    .select('id')
                    .eq('story_id', storyId)
                    .eq('user_id', userId)
                    .maybeSingle();

                if (cancelled) return;
                setIsFollowing(!!data);
            } else {
                setIsFollowing(false);
            }

            if (cancelled) return;
            setIsLoading(false);
        };

        fetchFollowState();
        return () => {
            cancelled = true;
        };
    }, [storyId, userId, initialFollowerCount, initialIsFollowing]);

    const toggleFollow = useCallback(async () => {
        if (!userId) {
            alert('กรุณาเข้าสู่ระบบก่อนติดตามเรื่อง');
            return;
        }

        // Optimistic update
        const wasFollowing = isFollowing;
        setIsFollowing(!wasFollowing);
        setFollowerCount(prev => prev + (wasFollowing ? -1 : 1));

        try {
            if (wasFollowing) {
                // Unfollow
                const { error } = await supabase
                    .from('follows')
                    .delete()
                    .eq('story_id', storyId)
                    .eq('user_id', userId);

                if (error) throw error;
            } else {
                // Follow — upsert to prevent duplicate errors
                const { error } = await supabase
                    .from('follows')
                    .upsert(
                        { user_id: userId, story_id: storyId },
                        { onConflict: 'user_id,story_id', ignoreDuplicates: true }
                    );

                if (error) throw error;
            }
        } catch (err) {
            // Revert on error
            console.error('[useFollow] Error:', err);
            setIsFollowing(wasFollowing);
            setFollowerCount(prev => prev + (wasFollowing ? 1 : -1));
        }
    }, [userId, isFollowing, storyId]);

    return { isFollowing, followerCount, toggleFollow, isLoading };
}
