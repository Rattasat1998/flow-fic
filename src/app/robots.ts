import type { MetadataRoute } from 'next';
import { getAppOrigin } from '@/lib/server/share';

export default function robots(): MetadataRoute.Robots {
  const appOrigin = getAppOrigin();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/dashboard/',
          '/login',
          '/auth/',
          '/bookshelf',
          '/notifications',
          '/story/create/',
          '/story/manage/',
          '/story/*/read',
        ],
      },
    ],
    sitemap: `${appOrigin}/sitemap.xml`,
    host: appOrigin,
  };
}
