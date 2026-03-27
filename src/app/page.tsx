import HomePageClient from '@/components/home/HomePageClient';
import {
  getDiscoveryResponse,
  type DiscoverySearchParams,
} from '@/lib/server/discovery';
import type { DiscoveryFilters } from '@/types/discovery';

const HOME_DISCOVERY_LIMIT = 12;

type HomePageProps = {
  searchParams?: Promise<DiscoverySearchParams> | DiscoverySearchParams;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  await Promise.resolve(searchParams ?? {});
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

  return (
    <HomePageClient
      initialDiscovery={initialDiscovery}
    />
  );
}
