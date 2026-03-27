import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WriterProfileClient from './WriterProfileClient';
import { buildWriterMetadata, getWriterShareMeta } from '@/lib/server/share';
import { buildWriterProfileJsonLd, serializeJsonLd } from '@/lib/server/seo';

type WriterProfilePageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: WriterProfilePageProps): Promise<Metadata> {
  const { id } = await params;
  return buildWriterMetadata(id);
}

export default async function WriterProfilePage({ params }: WriterProfilePageProps) {
  const { id } = await params;
  const writer = await getWriterShareMeta(id);
  if (!writer) {
    notFound();
  }

  const writerJsonLd = buildWriterProfileJsonLd(id, writer);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(writerJsonLd) }}
      />
      <WriterProfileClient writerId={id} />
    </>
  );
}
