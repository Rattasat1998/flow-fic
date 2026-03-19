import HomePageClient from '@/components/home/HomePageClient';
import {
  getDiscoveryResponse,
  parseDiscoveryFiltersWithOptions,
  type DiscoverySearchParams,
} from '@/lib/server/discovery';

const HOME_DISCOVERY_LIMIT = 12;

type HomePageProps = {
  searchParams?: Promise<DiscoverySearchParams> | DiscoverySearchParams;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const initialFilters = {
    ...parseDiscoveryFiltersWithOptions(resolvedSearchParams, {
      defaultCategory: 'all',
      defaultSubCategory: 'all',
      defaultFocusCore: false,
      defaultLimit: HOME_DISCOVERY_LIMIT,
    }),
    limit: HOME_DISCOVERY_LIMIT,
  };
  const initialDiscovery = await getDiscoveryResponse(initialFilters);

  return (
    <HomePageClient
      initialFilters={initialFilters}
      initialDiscovery={initialDiscovery}
    />
  );
}
