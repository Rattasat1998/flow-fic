import HomePageClient from '@/components/home/HomePageClient';
import { CORE_MAIN_CATEGORY_ID } from '@/lib/categories';
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
      defaultCategory: CORE_MAIN_CATEGORY_ID,
      defaultSubCategory: 'all',
      defaultFocusCore: true,
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
