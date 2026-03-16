import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
    try {
        const admin = getSupabaseAdmin();
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

        // 1. Overview counts (today)
        const [
            { count: totalEventsToday },
            { count: totalEvents7d },
            { count: totalEvents30d },
        ] = await Promise.all([
            admin.from('page_events').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
            admin.from('page_events').select('*', { count: 'exact', head: true }).gte('created_at', last7Days),
            admin.from('page_events').select('*', { count: 'exact', head: true }).gte('created_at', last30Days),
        ]);

        // 2. Unique users & sessions today
        const { data: uniqueToday } = await admin.rpc('get_analytics_overview', { p_since: todayStart });

        // 3. Event type breakdown (last 7 days)
        const { data: eventBreakdown } = await admin.rpc('get_event_breakdown', { p_since: last7Days });

        // 4. Top stories by views (last 30 days)
        const { data: topStories } = await admin.rpc('get_top_stories', { p_since: last30Days, p_limit: 10 });

        // 5. Recent events (latest 50)
        const { data: recentEvents } = await admin
            .from('page_events')
            .select('id, event_type, page_path, story_id, chapter_id, session_id, user_id, metadata, created_at')
            .order('created_at', { ascending: false })
            .limit(50);

        // 6. Funnel data (last 7 days)
        const funnelSteps = [
            'page_view',
            'story_view',
            'chapter_read',
            'choice_select',
            'pricing_view',
            'chapter_unlock',
        ];
        const funnelPromises = funnelSteps.map((step) =>
            admin
                .from('page_events')
                .select('*', { count: 'exact', head: true })
                .eq('event_type', step)
                .gte('created_at', last7Days)
        );
        const funnelResults = await Promise.all(funnelPromises);
        const funnel = funnelSteps.map((step, i) => ({
            step,
            count: funnelResults[i].count || 0,
        }));

        return NextResponse.json({
            overview: {
                today: totalEventsToday || 0,
                last7d: totalEvents7d || 0,
                last30d: totalEvents30d || 0,
                uniqueUsers: uniqueToday?.[0]?.unique_users || 0,
                uniqueSessions: uniqueToday?.[0]?.unique_sessions || 0,
            },
            eventBreakdown: eventBreakdown || [],
            topStories: topStories || [],
            recentEvents: recentEvents || [],
            funnel,
        });
    } catch (error) {
        console.error('[Analytics API] Error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch analytics data' },
            { status: 500 }
        );
    }
}
