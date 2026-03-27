import { NextRequest, NextResponse } from 'next/server';
import { applyInMemoryRateLimit, getRequestIp } from '@/lib/server/request-rate-limit';

type UnsplashPhoto = {
    id: string;
    alt_description: string | null;
    description: string | null;
    urls: {
        small: string;
        regular: string;
        full: string;
    };
    links: {
        html: string;
    };
    user: {
        name: string;
        links: {
            html: string;
        };
    };
};

type UnsplashSearchResponse = {
    total: number;
    total_pages: number;
    results: UnsplashPhoto[];
};

type UnsplashSearchItem = {
    id: string;
    alt: string;
    thumb: string;
    regular: string;
    full: string;
    author: string;
    authorUrl: string;
    unsplashUrl: string;
};

type UnsplashSearchPayload = {
    total: number;
    totalPages: number;
    results: UnsplashSearchItem[];
    error?: string;
    rateLimited?: boolean;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_CONTROL_HEADER = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 90;
const inMemoryCache = new Map<string, { expiresAt: number; payload: UnsplashSearchPayload }>();

export async function GET(request: NextRequest) {
    const accessKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!accessKey) {
        return NextResponse.json(
            { error: 'UNSPLASH_ACCESS_KEY is not configured' },
            { status: 500 }
        );
    }

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') || '').trim();
    if (!query) {
        return NextResponse.json(
            { total: 0, totalPages: 0, results: [] } satisfies UnsplashSearchPayload,
            { headers: { 'Cache-Control': CACHE_CONTROL_HEADER } }
        );
    }

    const rawPage = Number(searchParams.get('page') || '1');
    const rawPerPage = Number(searchParams.get('perPage') || '18');
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const perPage = Number.isFinite(rawPerPage)
        ? Math.min(Math.max(rawPerPage, 1), 30)
        : 18;
    const normalizedQuery = query.toLowerCase();
    const cacheKey = `${normalizedQuery}::${page}::${perPage}`;

    const cached = inMemoryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return NextResponse.json(cached.payload, {
            headers: {
                'Cache-Control': CACHE_CONTROL_HEADER,
            },
        });
    }

    const clientIp = getRequestIp(request.headers);
    const rateLimit = applyInMemoryRateLimit(
        `unsplash-search:${clientIp}`,
        RATE_LIMIT_MAX_REQUESTS,
        RATE_LIMIT_WINDOW_MS,
    );

    if (!rateLimit.allowed) {
        return NextResponse.json(
            {
                total: 0,
                totalPages: 0,
                results: [],
                error: 'Too many image searches. Please wait a moment and try again.',
                rateLimited: true,
            } satisfies UnsplashSearchPayload,
            {
                status: 429,
                headers: {
                    'Cache-Control': 'no-store',
                    'Retry-After': String(rateLimit.retryAfterSeconds),
                },
            }
        );
    }

    const url = new URL('https://api.unsplash.com/search/photos');
    url.searchParams.set('query', query);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('content_filter', 'high');

    const response = await fetch(url.toString(), {
        headers: {
            Authorization: `Client-ID ${accessKey}`,
            'Accept-Version': 'v1'
        },
        next: { revalidate: 60 }
    });

    if (!response.ok) {
        return NextResponse.json(
            { error: `Unsplash request failed with status ${response.status}` },
            { status: response.status }
        );
    }

    const data = (await response.json()) as UnsplashSearchResponse;
    const results = data.results.map((photo) => ({
        id: photo.id,
        alt: photo.alt_description || photo.description || 'Unsplash image',
        thumb: photo.urls.small,
        regular: photo.urls.regular,
        full: photo.urls.full,
        author: photo.user.name,
        authorUrl: photo.user.links.html,
        unsplashUrl: photo.links.html
    }));

    const payload: UnsplashSearchPayload = {
        total: data.total,
        totalPages: data.total_pages,
        results
    };

    inMemoryCache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        payload,
    });

    return NextResponse.json(payload, {
        headers: {
            'Cache-Control': CACHE_CONTROL_HEADER,
            'X-RateLimit-Remaining': String(rateLimit.remaining),
        },
    });
}
