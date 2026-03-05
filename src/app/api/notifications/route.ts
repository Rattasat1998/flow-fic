import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAuthenticatedClient(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    return createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
    });
}

// GET /api/notifications — list user's notifications
export async function GET(req: NextRequest) {
    const client = getAuthenticatedClient(req);
    if (!client) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authErr } = await client.auth.getUser();
    if (authErr || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '30'), 100);
    const unreadOnly = url.searchParams.get('unread') === 'true';

    let query = client
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (unreadOnly) {
        query = query.eq('is_read', false);
    }

    const { data, error } = await query;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also get unread count
    const { count: unreadCount } = await client
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

    return NextResponse.json({
        notifications: data || [],
        unreadCount: unreadCount || 0,
    });
}

// PATCH /api/notifications — mark as read
export async function PATCH(req: NextRequest) {
    const client = getAuthenticatedClient(req);
    if (!client) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authErr } = await client.auth.getUser();
    if (authErr || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { notificationId, markAll } = body as { notificationId?: string; markAll?: boolean };

    if (markAll) {
        const { error } = await client
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', user.id)
            .eq('is_read', false);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true, message: 'All marked as read' });
    }

    if (notificationId) {
        const { error } = await client
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId)
            .eq('user_id', user.id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Missing notificationId or markAll' }, { status: 400 });
}
