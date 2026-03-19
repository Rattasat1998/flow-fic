import 'server-only';

import { unstable_cache } from 'next/cache';
import type { Metadata } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const DEFAULT_SITE_TITLE = 'FlowFic';
export const DEFAULT_SITE_DESCRIPTION = 'แพลตฟอร์มอ่านเขียนนิยายสยองขวัญและสืบสวนที่ให้ผู้อ่านเลือกเส้นทางเรื่องได้';
export const ROOT_SHARE_IMAGE_PATH = '/opengraph-image';

const DEFAULT_APP_ORIGIN = 'http://localhost:3000';
const DEFAULT_IMAGE_WIDTH = 1200;
const DEFAULT_IMAGE_HEIGHT = 630;

type StoryShareRow = {
  id: string;
  title: string | null;
  pen_name: string | null;
  synopsis: string | null;
  cover_url: string | null;
  cover_wide_url: string | null;
  completion_status: string | null;
  path_mode: 'linear' | 'branching' | null;
};

type WriterProfileRow = {
  id: string;
  pen_name: string | null;
  bio: string | null;
  avatar_url: string | null;
};

type WriterLatestStoryRow = {
  id: string;
  title: string | null;
  pen_name: string | null;
  cover_url: string | null;
  cover_wide_url: string | null;
  created_at: string | null;
};

export type StoryShareMeta = {
  id: string;
  title: string;
  penName: string;
  synopsis: string;
  coverUrl: string | null;
  completionStatus: 'ongoing' | 'completed';
  pathMode: 'linear' | 'branching';
};

export type WriterShareMeta = {
  id: string;
  penName: string;
  bio: string;
  avatarUrl: string | null;
  publishedStoryCount: number;
  latestStoryCoverUrl: string | null;
};

const normalizeWhitespace = (value: string | null | undefined): string => (value || '').replace(/\s+/g, ' ').trim();

const truncateText = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

export function getAppOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return raw ? trimTrailingSlash(raw) : DEFAULT_APP_ORIGIN;
}

export function getMetadataBase(): URL {
  return new URL(getAppOrigin());
}

function buildMetadataImages(url: string, alt: string) {
  return [{
    url,
    width: DEFAULT_IMAGE_WIDTH,
    height: DEFAULT_IMAGE_HEIGHT,
    alt,
  }];
}

export function buildGenericMetadata(path: string): Metadata {
  const images = buildMetadataImages(ROOT_SHARE_IMAGE_PATH, DEFAULT_SITE_TITLE);

  return {
    title: DEFAULT_SITE_TITLE,
    description: DEFAULT_SITE_DESCRIPTION,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type: 'website',
      siteName: DEFAULT_SITE_TITLE,
      title: DEFAULT_SITE_TITLE,
      description: DEFAULT_SITE_DESCRIPTION,
      url: path,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: DEFAULT_SITE_TITLE,
      description: DEFAULT_SITE_DESCRIPTION,
      images: images.map((image) => image.url),
    },
  };
}

async function fetchStoryShareMeta(storyId: string): Promise<StoryShareMeta | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('stories')
    .select('id, title, pen_name, synopsis, cover_url, cover_wide_url, completion_status, path_mode')
    .eq('id', storyId)
    .eq('status', 'published')
    .maybeSingle();

  if (error || !data) return null;

  const row = data as StoryShareRow;
  const title = normalizeWhitespace(row.title) || 'เรื่องบน FlowFic';

  return {
    id: row.id,
    title,
    penName: normalizeWhitespace(row.pen_name) || 'นักเขียนนิรนาม',
    synopsis: normalizeWhitespace(row.synopsis),
    coverUrl: row.cover_wide_url || row.cover_url || null,
    completionStatus: row.completion_status === 'completed' ? 'completed' : 'ongoing',
    pathMode: row.path_mode === 'branching' ? 'branching' : 'linear',
  };
}

async function fetchWriterShareMeta(writerId: string): Promise<WriterShareMeta | null> {
  const admin = getSupabaseAdmin();
  const [{ data: profileData }, { data: storyData, count: storyCount }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, pen_name, bio, avatar_url')
      .eq('id', writerId)
      .maybeSingle(),
    admin
      .from('stories')
      .select('id, title, pen_name, cover_url, cover_wide_url, created_at', { count: 'exact' })
      .eq('user_id', writerId)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const profileRow = (profileData as WriterProfileRow | null) || null;
  const latestStory = ((storyData as WriterLatestStoryRow[] | null) || [])[0] || null;

  if (!profileRow && !latestStory) return null;

  return {
    id: writerId,
    penName: normalizeWhitespace(profileRow?.pen_name || latestStory?.pen_name) || 'นักเขียนนิรนาม',
    bio: normalizeWhitespace(profileRow?.bio),
    avatarUrl: profileRow?.avatar_url || null,
    publishedStoryCount: Math.max(0, Number(storyCount || 0)),
    latestStoryCoverUrl: latestStory?.cover_wide_url || latestStory?.cover_url || null,
  };
}

const getCachedStoryShareMeta = unstable_cache(
  async (storyId: string) => fetchStoryShareMeta(storyId),
  ['story-share-meta-v1'],
  { revalidate: 300 }
);

const getCachedWriterShareMeta = unstable_cache(
  async (writerId: string) => fetchWriterShareMeta(writerId),
  ['writer-share-meta-v1'],
  { revalidate: 300 }
);

export async function getStoryShareMeta(storyId: string): Promise<StoryShareMeta | null> {
  return getCachedStoryShareMeta(storyId);
}

export async function getWriterShareMeta(writerId: string): Promise<WriterShareMeta | null> {
  return getCachedWriterShareMeta(writerId);
}

export async function buildStoryMetadata(storyId: string): Promise<Metadata> {
  const story = await getStoryShareMeta(storyId);
  if (!story) return buildGenericMetadata(`/story/${storyId}`);

  const description = truncateText(story.synopsis || 'อ่านเรื่องนี้บน FlowFic', 180);
  const imagePath = `/story/${storyId}/opengraph-image`;
  const images = buildMetadataImages(imagePath, story.title);

  return {
    title: `${story.title} | ${DEFAULT_SITE_TITLE}`,
    description,
    alternates: {
      canonical: `/story/${storyId}`,
    },
    openGraph: {
      type: 'article',
      siteName: DEFAULT_SITE_TITLE,
      title: story.title,
      description,
      url: `/story/${storyId}`,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: story.title,
      description,
      images: images.map((image) => image.url),
    },
  };
}

export async function buildWriterMetadata(writerId: string): Promise<Metadata> {
  const writer = await getWriterShareMeta(writerId);
  if (!writer) return buildGenericMetadata(`/writer/${writerId}`);

  const description = truncateText(writer.bio || 'ดูโปรไฟล์นักเขียนบน FlowFic', 180);
  const imagePath = `/writer/${writerId}/opengraph-image`;
  const images = buildMetadataImages(imagePath, writer.penName);

  return {
    title: `${writer.penName} | ${DEFAULT_SITE_TITLE}`,
    description,
    alternates: {
      canonical: `/writer/${writerId}`,
    },
    openGraph: {
      type: 'profile',
      siteName: DEFAULT_SITE_TITLE,
      title: writer.penName,
      description,
      url: `/writer/${writerId}`,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: writer.penName,
      description,
      images: images.map((image) => image.url),
    },
  };
}
