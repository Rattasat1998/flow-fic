import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  evaluateChapterPublishModeration,
  type ChapterPublishModerationResult,
} from '@/lib/server/chapter-publish-moderation';

type ModerationRequestBody = {
  title?: unknown;
  content?: unknown;
  draftContent?: unknown;
};

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
};

function getPublicSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getAuthenticatedUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const accessToken = authHeader.slice('Bearer '.length).trim();
  if (!accessToken) return null;

  const supabase = getPublicSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) return null;
  return user;
}

const invalidPayload = () =>
  NextResponse.json(
    { error: 'Invalid moderation payload' },
    { status: 400, headers: NO_STORE_HEADERS },
  );

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE_HEADERS });
    }

    let body: ModerationRequestBody;
    try {
      body = (await request.json()) as ModerationRequestBody;
    } catch {
      return invalidPayload();
    }

    const content = body.draftContent ?? body.content;
    if (typeof body.title !== 'string' && !content) {
      return invalidPayload();
    }

    const result: ChapterPublishModerationResult = evaluateChapterPublishModeration({
      title: body.title ?? '',
      content,
    });

    if (!result.allowed) {
      return NextResponse.json(result, { status: 422, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json(result, { status: 200, headers: NO_STORE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Moderation check failed';
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
