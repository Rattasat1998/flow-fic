import TrendingPageClient from '@/components/home/TrendingPageClient';
import {
  getDiscoveryResponse,
} from '@/lib/server/discovery';
import type { DiscoveryFilters } from '@/types/discovery';

type TrendingPageProps = {
  searchParams?: Promise<{ page?: string }> | { page?: string };
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

  return (
    <TrendingPageClient
      initialStories={discovery.rails.trending.items}
      currentPage={page}
      limit={limit}
    />
  );
}
