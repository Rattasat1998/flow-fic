import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const VALID_METRIC_NAMES = new Set([
  'CLS',
  'FCP',
  'FID',
  'INP',
  'LCP',
  'TTFB',
  'Next.js-hydration',
  'Next.js-route-change-to-render',
  'Next.js-render',
]);

type WebVitalBody = {
  id?: string;
  name?: string;
  label?: string;
  value?: number;
  rating?: string;
  delta?: number;
  startTime?: number;
  navigationType?: string;
  path?: string;
};

function isFiniteNumber(input: unknown): input is number {
  return typeof input === 'number' && Number.isFinite(input);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as WebVitalBody;
    const metricName = typeof body.name === 'string' ? body.name : '';
    const metricPath = typeof body.path === 'string' && body.path.trim() ? body.path.trim() : '/';
    const metricLabel = typeof body.label === 'string' ? body.label : 'unknown';

    if (!VALID_METRIC_NAMES.has(metricName)) {
      return new NextResponse(null, { status: 204 });
    }

    if (!isFiniteNumber(body.value)) {
      return NextResponse.json({ error: 'Invalid metric value' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const sessionId = typeof body.id === 'string' && body.id.trim()
      ? `vital_${body.id.trim()}`
      : `vital_${crypto.randomUUID()}`;

    const { error } = await supabaseAdmin
      .from('page_events')
      .insert({
        user_id: null,
        session_id: sessionId,
        event_type: 'web_vitals',
        page_path: metricPath,
        story_id: null,
        chapter_id: null,
        metadata: {
          metric_label: metricLabel,
          metric_name: metricName,
          metric_value: body.value,
          metric_delta: isFiniteNumber(body.delta) ? body.delta : null,
          metric_start_time: isFiniteNumber(body.startTime) ? body.startTime : null,
          metric_rating: typeof body.rating === 'string' ? body.rating : null,
          navigation_type: typeof body.navigationType === 'string' ? body.navigationType : null,
        },
      });

    if (error) {
      throw error;
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
