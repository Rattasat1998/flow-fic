import type { Metadata } from 'next';
import CategoryPageClient from '@/components/home/CategoryPageClient';
import {
  getDiscoveryResponse,
} from '@/lib/server/discovery';
import { MAIN_CATEGORIES } from '@/lib/categories';
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
import { notFound } from 'next/navigation';

type CategoryPageProps = {
  params?: Promise<{ id: string }> | { id: string };
  searchParams?: Promise<{ page?: string }> | { page?: string };
};

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const resolvedParams = await Promise.resolve(params ?? { id: '' });
  const category = MAIN_CATEGORIES.find((entry) => entry.id === resolvedParams.id);

  if (!category) {
    return {
      title: `หมวดหมู่นิยาย | ${DEFAULT_SITE_TITLE}`,
      description: `เลือกหมวดนิยายที่ต้องการอ่านบน ${DEFAULT_SITE_TITLE}`,
      alternates: {
        canonical: '/category',
      },
    };
  }

  const title = `${category.label} | ${DEFAULT_SITE_TITLE}`;
  const description = `สำรวจนิยายหมวด ${category.label} บน ${DEFAULT_SITE_TITLE}`;
  const canonicalPath = `/category/${category.id}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: 'website',
      title,
      description,
      url: canonicalPath,
      images: [ROOT_SHARE_IMAGE_PATH],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ROOT_SHARE_IMAGE_PATH],
    },
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const resolvedParams = await Promise.resolve(params ?? { id: '' });
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});

  const categoryId = resolvedParams.id;
  const category = MAIN_CATEGORIES.find((c) => c.id === categoryId);

  if (!category) {
    notFound();
  }

  const page = Math.max(1, Number(resolvedSearchParams.page || '1'));
  const limit = 20;
  const offset = (page - 1) * limit;

  const filters: DiscoveryFilters = {
    q: '',
    category: categoryId,
    subCategory: 'all',
    completion: 'all',
    length: 'all',
    focusCore: false,
    limit,
    offset,
  };

  const discovery = await getDiscoveryResponse(filters);

  // Combine all rails to get all stories for this category
  const allStories = [
    ...discovery.rails.trending.items,
    ...discovery.rails.popular.items,
    ...discovery.rails.new.items,
  ];

  // Deduplicate
  const uniqueMap = new Map<string, typeof allStories[number]>();
  for (const story of allStories) {
    if (!uniqueMap.has(story.id)) uniqueMap.set(story.id, story);
  }

  const stories = Array.from(uniqueMap.values()).slice(0, limit);
  const collectionJsonLd = buildCollectionPageJsonLd(
    `/category/${categoryId}`,
    `หมวด ${category.label} บน FlowFic`,
    `รวมเรื่องแนะนำในหมวด ${category.label}`
  );
  const itemListJsonLd = buildStoryItemListJsonLd(
    `/category/${categoryId}`,
    `รายการเรื่องในหมวด ${category.label}`,
    stories
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
      <CategoryPageClient
        initialStories={stories}
        categoryId={categoryId}
        categoryLabel={category.label}
        currentPage={page}
        limit={limit}
      />
    </>
  );
}
