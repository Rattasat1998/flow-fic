import type { Metadata } from 'next';
import TrendingPageClient from '@/components/home/TrendingPageClient';
import {
  getDiscoveryResponse,
} from '@/lib/server/discovery';
import {
  DEFAULT_SITE_TITLE,
  ROOT_SHARE_IMAGE_PATH,
} from '@/lib/server/share';
import {
  buildCollectionPageJsonLd,
  buildStoryItemListJsonLd,
  serializeJsonLd,
} from '@/lib/server/seo';
import type { DiscoveryFilters } from '@/types/discovery';

type TrendingPageProps = {
  searchParams?: Promise<{ page?: string }> | { page?: string };
};

const TRENDING_TITLE = `เรื่องมาแรง | ${DEFAULT_SITE_TITLE}`;
const TRENDING_DESCRIPTION = 'รวมเรื่องมาแรงบน FlowFic คัดจากพฤติกรรมการอ่านล่าสุด เพื่อช่วยคุณเริ่มอ่านเรื่องที่คนกำลังติดตาม';

export const metadata: Metadata = {
  title: TRENDING_TITLE,
  description: TRENDING_DESCRIPTION,
  alternates: {
    canonical: '/trending',
  },
  openGraph: {
    type: 'website',
    title: TRENDING_TITLE,
    description: TRENDING_DESCRIPTION,
    url: '/trending',
    images: [ROOT_SHARE_IMAGE_PATH],
  },
  twitter: {
    card: 'summary_large_image',
    title: TRENDING_TITLE,
    description: TRENDING_DESCRIPTION,
    images: [ROOT_SHARE_IMAGE_PATH],
  },
};

export default async function TrendingPage({ searchParams }: TrendingPageProps) {
  const params = await Promise.resolve(searchParams ?? {});
  const page = Math.max(1, Number(params.page || '1'));
  const limit = 20;
  const offset = (page - 1) * limit;

  const filters: DiscoveryFilters = {
    q: '',
    category: 'all',
    subCategory: 'all',
    completion: 'all',
    length: 'all',
    focusCore: false,
    limit,
    offset,
  };
  
  const discovery = await getDiscoveryResponse(filters);
  const collectionJsonLd = buildCollectionPageJsonLd('/trending', 'เรื่องมาแรงบน FlowFic', TRENDING_DESCRIPTION);
  const itemListJsonLd = buildStoryItemListJsonLd(
    '/trending',
    'รายการเรื่องมาแรงบน FlowFic',
    discovery.rails.trending.items
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(collectionJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(itemListJsonLd) }}
      />
      <TrendingPageClient
        initialStories={discovery.rails.trending.items}
        currentPage={page}
        limit={limit}
      />
    </>
  );
}
