import CategoryPageClient from '@/components/home/CategoryPageClient';
import {
  getDiscoveryResponse,
} from '@/lib/server/discovery';
import { MAIN_CATEGORIES } from '@/lib/categories';
import type { DiscoveryFilters } from '@/types/discovery';
import { notFound } from 'next/navigation';

type CategoryPageProps = {
  params?: Promise<{ id: string }> | { id: string };
  searchParams?: Promise<{ page?: string }> | { page?: string };
};

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

  return (
    <CategoryPageClient
      initialStories={stories}
      categoryId={categoryId}
      categoryLabel={category.label}
      currentPage={page}
      limit={limit}
    />
  );
}
