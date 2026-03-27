import type { MetadataRoute } from 'next';
import { MAIN_CATEGORIES } from '@/lib/categories';
import { getAppOrigin } from '@/lib/server/share';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const revalidate = 3600;

const STATIC_PUBLIC_PATHS = [
  '/',
  '/trending',
  '/pricing',
  '/about',
  '/help',
  '/privacy',
  '/terms',
  '/billing-policies',
] as const;

const SITEMAP_BATCH_SIZE = 1000;

type StorySitemapRow = {
  id: string;
  user_id: string | null;
  updated_at: string | null;
};

const toLastModifiedDate = (value: string | null | undefined, fallback: Date): Date => {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
};

async function fetchPublishedStoriesForSitemap(): Promise<StorySitemapRow[]> {
  const admin = getSupabaseAdmin();
  const rows: StorySitemapRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await admin
      .from('stories')
      .select('id, user_id, updated_at')
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .range(offset, offset + SITEMAP_BATCH_SIZE - 1);

    if (error) throw new Error(error.message);

    const batch = (data as StorySitemapRow[] | null) || [];
    if (batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < SITEMAP_BATCH_SIZE) break;
    offset += SITEMAP_BATCH_SIZE;
  }

  return rows;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const appOrigin = getAppOrigin();
  const generatedAt = new Date();
  const stories = await fetchPublishedStoriesForSitemap();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PUBLIC_PATHS.map((path) => ({
    url: `${appOrigin}${path}`,
    lastModified: generatedAt,
    changeFrequency: path === '/' ? 'hourly' : 'weekly',
    priority: path === '/' ? 1 : 0.7,
  }));

  const categoryEntries: MetadataRoute.Sitemap = MAIN_CATEGORIES.map((category) => ({
    url: `${appOrigin}/category/${category.id}`,
    lastModified: generatedAt,
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  const storyEntries: MetadataRoute.Sitemap = stories.map((story) => ({
    url: `${appOrigin}/story/${story.id}`,
    lastModified: toLastModifiedDate(story.updated_at, generatedAt),
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  const writerLatestUpdatedAt = new Map<string, string>();
  stories.forEach((story) => {
    if (!story.user_id) return;
    const previous = writerLatestUpdatedAt.get(story.user_id);
    if (!previous || (story.updated_at && story.updated_at > previous)) {
      writerLatestUpdatedAt.set(story.user_id, story.updated_at || generatedAt.toISOString());
    }
  });

  const writerEntries: MetadataRoute.Sitemap = Array.from(writerLatestUpdatedAt.entries()).map(([writerId, updatedAt]) => ({
    url: `${appOrigin}/writer/${writerId}`,
    lastModified: toLastModifiedDate(updatedAt, generatedAt),
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [...staticEntries, ...categoryEntries, ...storyEntries, ...writerEntries];
}
