import type { Metadata } from 'next';
import HomePageClient from '@/components/home/HomePageClient';
import {
  getDiscoveryResponse,
  type DiscoverySearchParams,
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

const HOME_DISCOVERY_LIMIT = 12;
const HOME_TITLE = `${DEFAULT_SITE_TITLE} | แพลตฟอร์มนิยายอินเทอร์แอคทีฟ`;
const HOME_DESCRIPTION = 'อ่านและเขียนนิยายออนไลน์แบบอินเทอร์แอคทีฟ เลือกเส้นเรื่องได้ด้วย Branching Story บน FlowFic';

export const metadata: Metadata = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    url: '/',
    images: [ROOT_SHARE_IMAGE_PATH],
  },
  twitter: {
    card: 'summary_large_image',
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [ROOT_SHARE_IMAGE_PATH],
  },
};

type HomePageProps = {
  searchParams?: Promise<DiscoverySearchParams>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  await searchParams;
  const initialFilters: DiscoveryFilters = {
    q: '',
    category: 'all',
    subCategory: 'all',
    completion: 'all',
    length: 'all',
    focusCore: false,
    limit: HOME_DISCOVERY_LIMIT,
    offset: 0,
  };
  const initialDiscovery = await getDiscoveryResponse(initialFilters);
  const mergedStories = [
    ...initialDiscovery.rails.trending.items,
    ...initialDiscovery.rails.popular.items,
    ...initialDiscovery.rails.new.items,
  ];
  const uniqueStories = new Map<string, typeof mergedStories[number]>();
  mergedStories.forEach((story) => {
    if (!uniqueStories.has(story.id)) {
      uniqueStories.set(story.id, story);
    }
  });
  const featuredStories = Array.from(uniqueStories.values()).slice(0, 10);
  const collectionJsonLd = buildCollectionPageJsonLd('/', 'หน้าแรก FlowFic', HOME_DESCRIPTION);
  const itemListJsonLd = buildStoryItemListJsonLd('/', 'เรื่องแนะนำบน FlowFic', featuredStories);

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
      <HomePageClient
        initialDiscovery={initialDiscovery}
      />
    </>
  );
}
