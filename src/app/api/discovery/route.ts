import { NextRequest, NextResponse } from 'next/server';
import {
  getDiscoveryResponse,
  parseDiscoveryFiltersFromUrlSearchParams,
} from '@/lib/server/discovery';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const filters = parseDiscoveryFiltersFromUrlSearchParams(url.searchParams);
    const response = await getDiscoveryResponse(filters);

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
