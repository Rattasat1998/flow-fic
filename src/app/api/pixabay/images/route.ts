import { NextRequest, NextResponse } from 'next/server';
import { applyInMemoryRateLimit, getRequestIp } from '@/lib/server/request-rate-limit';

type PixabayImageHit = {
    id?: number | string;
    tags?: string;
    user?: string;
    user_id?: number;
    pageURL?: string;
    previewURL?: string;
    webformatURL?: string;
    largeImageURL?: string;
    fullHDURL?: string;
    imageURL?: string;
    userURL?: string;
    user_url?: string;
    profileURL?: string;
    profile_url?: string;
    [key: string]: unknown;
};

type PixabayImageResponse = {
    total?: number;
    totalHits?: number;
    hits?: PixabayImageHit[];
};

type PixabayImageResult = {
    id: string;
    alt: string;
    thumb: string;
    regular: string;
    full: string;
    author: string;
    authorUrl: string;
    source: 'pixabay';
    sourceUrl: string | null;
};

type CachedPayload = {
    available: boolean;
    total: number;
    totalPages: number;
    results: PixabayImageResult[];
    error?: string;
    rateLimited?: boolean;
};

const PIXABAY_IMAGE_API_URL = 'https://pixabay.com/api/';
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_CONTROL_HEADER = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 90;
const inMemoryCache = new Map<string, { expiresAt: number; payload: CachedPayload }>();

const asNonEmptyString = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const asFiniteNumber = (value: unknown): number | null => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
};

const toCreatorProfileUrl = (hit: PixabayImageHit): string | null => {
    const explicitCandidates = [hit.userURL, hit.user_url, hit.profileURL, hit.profile_url];
    for (const candidate of explicitCandidates) {
        const explicit = asNonEmptyString(candidate);
        if (explicit) return explicit;
    }

    const userName = asNonEmptyString(hit.user);
    const userId = asFiniteNumber(hit.user_id);
    if (!userName || userId === null) return null;

    return `https://pixabay.com/users/${encodeURIComponent(userName)}-${Math.floor(userId)}/`;
};

const mapHitToResult = (hit: PixabayImageHit): PixabayImageResult | null => {
    const thumb = asNonEmptyString(hit.webformatURL)
        || asNonEmptyString(hit.previewURL)
        || asNonEmptyString(hit.largeImageURL);
    const regular = asNonEmptyString(hit.largeImageURL)
        || asNonEmptyString(hit.webformatURL)
        || asNonEmptyString(hit.previewURL);
    if (!thumb || !regular) return null;

    const full = asNonEmptyString(hit.fullHDURL)
        || asNonEmptyString(hit.imageURL)
        || regular;
    const sourceUrl = asNonEmptyString(hit.pageURL);
    const author = asNonEmptyString(hit.user) || 'Pixabay contributor';
    const authorUrl = toCreatorProfileUrl(hit) || sourceUrl || 'https://pixabay.com/';
    const alt = asNonEmptyString(hit.tags) || 'Pixabay image';

    return {
        id: String(hit.id ?? `${author}-${regular}`),
        alt,
        thumb,
        regular,
        full,
        author,
        authorUrl,
        source: 'pixabay',
        sourceUrl,
    };
};

export async function GET(request: NextRequest) {
    const apiKey = process.env.PIXABAY_API_KEY;
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') || '').trim();
    const rawPage = Number(searchParams.get('page') || '1');
    const rawPerPage = Number(searchParams.get('perPage') || '18');
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const perPage = Number.isFinite(rawPerPage)
        ? Math.min(Math.max(Math.floor(rawPerPage), 3), 60)
        : 18;

    if (!query) {
        return NextResponse.json(
            {
                available: !!apiKey,
                total: 0,
                totalPages: 0,
                results: [],
            } satisfies CachedPayload,
            {
                headers: {
                    'Cache-Control': CACHE_CONTROL_HEADER,
                },
            }
        );
    }

    if (!apiKey) {
        return NextResponse.json(
            {
                available: false,
                total: 0,
                totalPages: 0,
                results: [],
                error: 'PIXABAY_API_KEY is not configured',
            } satisfies CachedPayload,
            {
                headers: {
                    'Cache-Control': CACHE_CONTROL_HEADER,
                },
            }
        );
    }

    const cacheKey = `${query.toLowerCase()}::${page}::${perPage}`;
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
        `pixabay-images:${clientIp}`,
        RATE_LIMIT_MAX_REQUESTS,
        RATE_LIMIT_WINDOW_MS,
    );

    if (!rateLimit.allowed) {
        return NextResponse.json(
            {
                available: true,
                total: 0,
                totalPages: 0,
                results: [],
                error: 'Too many image searches. Please wait a moment and try again.',
                rateLimited: true,
            } satisfies CachedPayload,
            {
                status: 429,
                headers: {
                    'Cache-Control': 'no-store',
                    'Retry-After': String(rateLimit.retryAfterSeconds),
                },
            }
        );
    }

    const url = new URL(PIXABAY_IMAGE_API_URL);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('q', query);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('order', 'popular');
    url.searchParams.set('safesearch', 'true');

    try {
        const response = await fetch(url.toString(), {
            next: { revalidate: 60 },
        });

        if (!response.ok) {
            const payload: CachedPayload = {
                available: !(response.status === 401 || response.status === 403),
                total: 0,
                totalPages: 0,
                results: [],
                error: response.status === 429
                    ? 'Pixabay API rate limit exceeded. Please try again later.'
                    : `Pixabay request failed (${response.status})`,
                rateLimited: response.status === 429,
            };

            return NextResponse.json(payload, {
                headers: {
                    'Cache-Control': CACHE_CONTROL_HEADER,
                },
                status: response.status,
            });
        }

        const data = (await response.json()) as PixabayImageResponse;
        const rawHits = Array.isArray(data.hits) ? data.hits : [];
        const results = rawHits
            .map(mapHitToResult)
            .filter((item): item is PixabayImageResult => item !== null);
        const total = Number.isFinite(Number(data.totalHits)) ? Number(data.totalHits) : results.length;
        const totalPages = total > 0 ? Math.ceil(total / perPage) : 0;

        const payload: CachedPayload = {
            available: true,
            total,
            totalPages,
            results,
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
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to search Pixabay images';
        return NextResponse.json(
            {
                available: true,
                total: 0,
                totalPages: 0,
                results: [],
                error: message,
            } satisfies CachedPayload,
            {
                headers: {
                    'Cache-Control': CACHE_CONTROL_HEADER,
                },
                status: 502,
            }
        );
    }
}
