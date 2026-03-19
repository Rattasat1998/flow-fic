import type { Metadata } from 'next';
import StoryDetailsClient from './StoryDetailsClient';
import { buildStoryMetadata } from '@/lib/server/share';

type StoryDetailsPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: StoryDetailsPageProps): Promise<Metadata> {
  const { id } = await params;
  return buildStoryMetadata(id);
}

export default async function StoryDetailsPage({ params }: StoryDetailsPageProps) {
  const { id } = await params;
  return <StoryDetailsClient storyId={id} />;
}
