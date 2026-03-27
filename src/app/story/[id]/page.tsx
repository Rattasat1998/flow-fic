import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import StoryDetailsClient from './StoryDetailsClient';
import { buildStoryMetadata, getStoryShareMeta } from '@/lib/server/share';
import { buildStoryBookJsonLd, serializeJsonLd } from '@/lib/server/seo';

type StoryDetailsPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: StoryDetailsPageProps): Promise<Metadata> {
  const { id } = await params;
  return buildStoryMetadata(id);
}

export default async function StoryDetailsPage({ params }: StoryDetailsPageProps) {
  const { id } = await params;
  const story = await getStoryShareMeta(id);
  if (!story) {
    notFound();
  }

  const storyJsonLd = buildStoryBookJsonLd(id, story);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(storyJsonLd) }}
      />
      <StoryDetailsClient storyId={id} />
    </>
  );
}
