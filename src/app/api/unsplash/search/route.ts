import { NextRequest, NextResponse } from 'next/server';

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
        return NextResponse.json({ total: 0, totalPages: 0, results: [] });
    }

    const rawPage = Number(searchParams.get('page') || '1');
    const rawPerPage = Number(searchParams.get('perPage') || '18');
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const perPage = Number.isFinite(rawPerPage)
        ? Math.min(Math.max(rawPerPage, 1), 30)
        : 18;

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

    return NextResponse.json({
        total: data.total,
        totalPages: data.total_pages,
        results
    });
}
