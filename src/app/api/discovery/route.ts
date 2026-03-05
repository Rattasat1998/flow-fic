import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type {
  DiscoveryCompletionFilter,
  DiscoveryLengthFilter,
  DiscoveryRailKey,
  DiscoveryResponse,
  DiscoveryStory,
} from '@/types/discovery';

const VALID_COMPLETIONS = new Set<DiscoveryCompletionFilter>(['all', 'ongoing', 'completed']);
const VALID_LENGTHS = new Set<DiscoveryLengthFilter>(['all', 'short', 'medium', 'long']);

function parseQuery(raw: string | null): string {
  return (raw || '').trim().slice(0, 120);
}

function parseCategory(raw: string | null): string {
  const value = (raw || 'all').trim();
  return value.length > 0 ? value : 'all';
}

function parseCompletion(raw: string | null): DiscoveryCompletionFilter {
  const value = (raw || 'all').trim() as DiscoveryCompletionFilter;
  return VALID_COMPLETIONS.has(value) ? value : 'all';
}

function parseLength(raw: string | null): DiscoveryLengthFilter {
  const value = (raw || 'all').trim() as DiscoveryLengthFilter;
  return VALID_LENGTHS.has(value) ? value : 'all';
}

function parseLimit(raw: string | null): number {
  const parsed = Number(raw || '12');
  if (!Number.isFinite(parsed)) return 12;
  return Math.max(1, Math.min(24, Math.floor(parsed)));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'UNKNOWN_ERROR';
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const q = parseQuery(url.searchParams.get('q'));
    const category = parseCategory(url.searchParams.get('category'));
    const completion = parseCompletion(url.searchParams.get('completion'));
    const length = parseLength(url.searchParams.get('length'));
    const limit = parseLimit(url.searchParams.get('limit'));

    const admin = getSupabaseAdmin();
    const railKeys: DiscoveryRailKey[] = ['new', 'popular', 'trending'];

    const settled = await Promise.allSettled(
      railKeys.map(async (rail) => {
        const { data, error } = await admin.rpc('get_discovery_rail', {
          p_rail: rail,
          p_q: q || null,
          p_category: category,
          p_completion: completion,
          p_length: length,
          p_limit: limit,
        });

        if (error) throw new Error(error.message);
        return { rail, items: (data || []) as DiscoveryStory[] };
      })
    );

    const rails: DiscoveryResponse['rails'] = {
      new: { items: [], error: null },
      popular: { items: [], error: null },
      trending: { items: [], error: null },
    };

    settled.forEach((result, index) => {
      const railKey = railKeys[index];
      if (result.status === 'fulfilled') {
        rails[railKey] = { items: result.value.items, error: null };
      } else {
        rails[railKey] = { items: [], error: getErrorMessage(result.reason) };
      }
    });

    const response: DiscoveryResponse = {
      filters: { q, category, completion, length, limit },
      rails,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 's-maxage=300, stale-while-revalidate=900',
      },
    });
  } catch (error) {
    console.error('[Discovery API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch discovery rails' },
      { status: 500 }
    );
  }
}
