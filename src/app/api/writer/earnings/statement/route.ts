import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser } from '../../_lib';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

type RevenueEventRow = {
  id: string;
  event_type: string;
  created_at: string;
  story_id: string | null;
  chapter_id: string | null;
  reader_user_id: string | null;
  coins: number;
  gross_satang: number;
  writer_share_satang: number;
  description: string | null;
};

type StoryTitleRow = {
  id: string;
  title: string;
};

type ChapterTitleRow = {
  id: string;
  title: string;
};

function toPositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const search = request.nextUrl.searchParams;
    const page = toPositiveInt(search.get('page'), 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, toPositiveInt(search.get('pageSize'), DEFAULT_PAGE_SIZE));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const fromDate = (search.get('from') || '').trim();
    const toDate = (search.get('to') || '').trim();
    const storyId = (search.get('storyId') || '').trim();

    const supabaseAdmin = getSupabaseAdmin();

    let query = supabaseAdmin
      .from('creator_revenue_events')
      .select('id, event_type, created_at, story_id, chapter_id, reader_user_id, coins, gross_satang, writer_share_satang, description', { count: 'exact' })
      .eq('writer_user_id', user.id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);

    if (fromDate) {
      query = query.gte('created_at', fromDate);
    }

    if (toDate) {
      query = query.lte('created_at', toDate);
    }

    if (storyId) {
      query = query.eq('story_id', storyId);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    const rows = (data || []) as RevenueEventRow[];

    const storyIds = Array.from(new Set(rows.map((item) => item.story_id).filter((value): value is string => !!value)));
    const chapterIds = Array.from(new Set(rows.map((item) => item.chapter_id).filter((value): value is string => !!value)));

    const [{ data: storyRows }, { data: chapterRows }] = await Promise.all([
      storyIds.length > 0
        ? supabaseAdmin.from('stories').select('id, title').in('id', storyIds)
        : Promise.resolve({ data: [] as StoryTitleRow[] }),
      chapterIds.length > 0
        ? supabaseAdmin.from('chapters').select('id, title').in('id', chapterIds)
        : Promise.resolve({ data: [] as ChapterTitleRow[] }),
    ]);

    const storyMap = new Map(((storyRows || []) as StoryTitleRow[]).map((item) => [item.id, item.title]));
    const chapterMap = new Map(((chapterRows || []) as ChapterTitleRow[]).map((item) => [item.id, item.title]));

    const statement = rows.map((item) => ({
      eventId: item.id,
      eventType: item.event_type,
      createdAt: item.created_at,
      storyId: item.story_id,
      chapterId: item.chapter_id,
      storyTitle: item.story_id ? storyMap.get(item.story_id) || null : null,
      chapterTitle: item.chapter_id ? chapterMap.get(item.chapter_id) || null : null,
      readerUserId: item.reader_user_id,
      coins: Number(item.coins || 0),
      grossSatang: Number(item.gross_satang || 0),
      writerShareSatang: Number(item.writer_share_satang || 0),
      description: item.description,
    }));

    const storyRollupMap = new Map<string, { storyId: string; storyTitle: string | null; writerShareSatang: number }>();
    statement.forEach((item) => {
      if (!item.storyId) return;
      const existing = storyRollupMap.get(item.storyId) || {
        storyId: item.storyId,
        storyTitle: item.storyTitle,
        writerShareSatang: 0,
      };
      existing.writerShareSatang += item.writerShareSatang;
      storyRollupMap.set(item.storyId, existing);
    });

    return NextResponse.json({
      success: true,
      pagination: {
        page,
        pageSize,
        total: Number(count || 0),
      },
      statement,
      storyRollups: Array.from(storyRollupMap.values()).sort((a, b) => b.writerShareSatang - a.writerShareSatang),
      filters: {
        from: fromDate || null,
        to: toDate || null,
        storyId: storyId || null,
      },
    });
  } catch (error) {
    console.error('writer-earnings-statement failed:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
