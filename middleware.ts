import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const NOINDEX_PATH_PATTERNS = [
  /^\/admin(?:\/|$)/,
  /^\/dashboard(?:\/|$)/,
  /^\/login(?:\/|$)/,
  /^\/auth(?:\/|$)/,
  /^\/bookshelf(?:\/|$)/,
  /^\/notifications(?:\/|$)/,
  /^\/story\/create(?:\/|$)/,
  /^\/story\/manage(?:\/|$)/,
  /^\/story\/[^/]+\/read(?:\/|$)/,
];

const shouldSetNoindex = (pathname: string): boolean => NOINDEX_PATH_PATTERNS.some((pattern) => pattern.test(pathname));

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  if (shouldSetNoindex(request.nextUrl.pathname)) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml)$).*)',
  ],
};
