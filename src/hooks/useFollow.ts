'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface UseFollowOptions {
    storyId: string;
    userId: string | null | undefined;
}

interface UseFollowReturn {
    isFollowing: boolean;
    followerCount: number;
    toggleFollow: () => Promise<void>;
    isLoading: boolean;
}

export function useFollow({ storyId, userId }: UseFollowOptions): UseFollowReturn {
    const [isFollowing, setIsFollowing] = useState(false);
    const [followerCount, setFollowerCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch initial state
    useEffect(() => {
        if (!storyId) return;

        const fetchFollowState = async () => {
            setIsLoading(true);

            // Get follower count
            const { count } = await supabase
                .from('follows')
                .select('*', { count: 'exact', head: true })
                .eq('story_id', storyId);

            setFollowerCount(count || 0);

            // Check if current user follows this story
            if (userId) {
                const { data } = await supabase
                    .from('follows')
                    .select('id')
                    .eq('story_id', storyId)
                    .eq('user_id', userId)
                    .maybeSingle();

                setIsFollowing(!!data);
            }

            setIsLoading(false);
        };

        fetchFollowState();
    }, [storyId, userId]);

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
