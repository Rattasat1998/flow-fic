import type { Metadata } from 'next';
import WriterProfileClient from './WriterProfileClient';
import { buildWriterMetadata } from '@/lib/server/share';

type WriterProfilePageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: WriterProfilePageProps): Promise<Metadata> {
  const { id } = await params;
  return buildWriterMetadata(id);
}

export default async function WriterProfilePage({ params }: WriterProfilePageProps) {
  const { id } = await params;
  return <WriterProfileClient writerId={id} />;
}
