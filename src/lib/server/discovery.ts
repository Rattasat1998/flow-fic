import 'server-only';

import { unstable_cache } from 'next/cache';
import { FEATURE_FLAGS } from '@/lib/featureFlags';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type {
  DiscoveryCategoryFilter,
  DiscoveryCompletionFilter,
  DiscoveryFilters,
  DiscoveryLengthFilter,
  DiscoveryRailKey,
  DiscoveryResponse,
  DiscoveryStory,
  DiscoverySubCategoryFilter,
} from '@/types/discovery';

const VALID_COMPLETIONS = new Set<DiscoveryCompletionFilter>(['all', 'ongoing', 'completed']);
const VALID_LENGTHS = new Set<DiscoveryLengthFilter>(['all', 'short', 'medium', 'long']);
const DISCOVERY_DEFAULT_LIMIT = 12;

const DEFAULT_DISCOVERY_FILTERS: DiscoveryFilters = {
  q: '',
  category: 'all',
  subCategory: 'all',
  completion: 'all',
  length: 'all',
  focusCore: FEATURE_FLAGS.discoveryCoreFocus,
  limit: DISCOVERY_DEFAULT_LIMIT,
};

type SearchParamValue = string | string[] | undefined;

export type DiscoverySearchParams = Record<string, SearchParamValue>;
type DiscoveryFilterParseOptions = Partial<{
  defaultCategory: DiscoveryCategoryFilter;
  defaultSubCategory: DiscoverySubCategoryFilter;
  defaultCompletion: DiscoveryCompletionFilter;
  defaultLength: DiscoveryLengthFilter;
  defaultFocusCore: boolean;
  defaultLimit: number;
}>;

function firstValue(value: SearchParamValue): string | null {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : null;
  }

  return typeof value === 'string' ? value : null;
}

function parseQuery(raw: string | null): string {
  return (raw || '').trim().slice(0, 120);
}

function parseCategory(raw: string | null, defaultCategory: DiscoveryCategoryFilter): string {
  const value = (raw || defaultCategory).trim();
  return value.length > 0 ? value : defaultCategory;
}

function parseSubCategory(raw: string | null, defaultSubCategory: DiscoverySubCategoryFilter): DiscoverySubCategoryFilter {
  const value = (raw || defaultSubCategory).trim();
  return value.length > 0 ? value : defaultSubCategory;
}

function parseCompletion(raw: string | null, defaultCompletion: DiscoveryCompletionFilter): DiscoveryCompletionFilter {
  const value = (raw || defaultCompletion).trim() as DiscoveryCompletionFilter;
  return VALID_COMPLETIONS.has(value) ? value : defaultCompletion;
}

function parseLength(raw: string | null, defaultLength: DiscoveryLengthFilter): DiscoveryLengthFilter {
  const value = (raw || defaultLength).trim() as DiscoveryLengthFilter;
  return VALID_LENGTHS.has(value) ? value : defaultLength;
}

function parseLimit(raw: string | null, defaultLimit: number): number {
  const parsed = Number(raw || String(defaultLimit));
  if (!Number.isFinite(parsed)) return defaultLimit;
  return Math.max(1, Math.min(24, Math.floor(parsed)));
}

function parseFocusCore(raw: string | null, defaultFocusCore: boolean): boolean {
  if (!FEATURE_FLAGS.discoveryCoreFocus) return false;

  const normalized = (raw || '').trim().toLowerCase();
  if (normalized === 'false' || normalized === '0') return false;
  if (normalized === 'true' || normalized === '1') return true;
  return defaultFocusCore;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'UNKNOWN_ERROR';
}

function readSearchParam(searchParams: DiscoverySearchParams, key: string): string | null {
  return firstValue(searchParams[key]);
}

export function parseDiscoveryFilters(searchParams: DiscoverySearchParams): DiscoveryFilters {
  return parseDiscoveryFiltersWithOptions(searchParams);
}

export function parseDiscoveryFiltersWithOptions(
  searchParams: DiscoverySearchParams,
  options: DiscoveryFilterParseOptions = {}
): DiscoveryFilters {
  const defaults = {
    defaultCategory: options.defaultCategory ?? DEFAULT_DISCOVERY_FILTERS.category,
    defaultSubCategory: options.defaultSubCategory ?? DEFAULT_DISCOVERY_FILTERS.subCategory,
    defaultCompletion: options.defaultCompletion ?? DEFAULT_DISCOVERY_FILTERS.completion,
    defaultLength: options.defaultLength ?? DEFAULT_DISCOVERY_FILTERS.length,
    defaultFocusCore: options.defaultFocusCore ?? DEFAULT_DISCOVERY_FILTERS.focusCore,
    defaultLimit: options.defaultLimit ?? DEFAULT_DISCOVERY_FILTERS.limit,
  };

  return {
    q: parseQuery(readSearchParam(searchParams, 'q')),
    category: parseCategory(readSearchParam(searchParams, 'category'), defaults.defaultCategory),
    subCategory: parseSubCategory(readSearchParam(searchParams, 'subCategory'), defaults.defaultSubCategory),
    completion: parseCompletion(readSearchParam(searchParams, 'completion'), defaults.defaultCompletion),
    length: parseLength(readSearchParam(searchParams, 'length'), defaults.defaultLength),
    focusCore: parseFocusCore(readSearchParam(searchParams, 'focusCore'), defaults.defaultFocusCore),
    limit: parseLimit(readSearchParam(searchParams, 'limit'), defaults.defaultLimit),
  };
}

export function parseDiscoveryFiltersFromUrlSearchParams(
  searchParams: URLSearchParams,
  options: DiscoveryFilterParseOptions = {}
): DiscoveryFilters {
  return parseDiscoveryFiltersWithOptions({
    q: searchParams.get('q') || undefined,
    category: searchParams.get('category') || undefined,
    subCategory: searchParams.get('subCategory') || undefined,
    completion: searchParams.get('completion') || undefined,
    length: searchParams.get('length') || undefined,
    focusCore: searchParams.get('focusCore') || undefined,
    limit: searchParams.get('limit') || undefined,
  }, options);
}

export function buildDiscoveryQueryString(filters: DiscoveryFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.category !== 'all') params.set('category', filters.category);
  if (filters.subCategory !== 'all') params.set('subCategory', filters.subCategory);
  if (filters.completion !== 'all') params.set('completion', filters.completion);
  if (filters.length !== 'all') params.set('length', filters.length);
  params.set('focusCore', filters.focusCore ? 'true' : 'false');
  params.set('limit', String(filters.limit));
  return params.toString();
}

async function fetchDiscoveryResponse(filters: DiscoveryFilters): Promise<DiscoveryResponse> {
  const admin = getSupabaseAdmin();
  const railKeys: DiscoveryRailKey[] = ['new', 'popular', 'trending'];

  const settled = await Promise.allSettled(
    railKeys.map(async (rail) => {
      const { data, error } = await admin.rpc('get_discovery_rail', {
        p_rail: rail,
        p_q: filters.q || null,
        p_category: filters.category,
        p_sub_category: filters.subCategory,
        p_completion: filters.completion,
        p_length: filters.length,
        p_focus_core: filters.focusCore,
        p_limit: filters.limit,
      });

      if (error) throw new Error(error.message);
      return { rail, items: (data || []) as DiscoveryStory[] };
    })
  );

  const rails: DiscoveryResponse['rails'] = {
    new: { items: [], error: null },
    popular: { items: [], error: null },
    trending: { items: [], error: null },
  };

  settled.forEach((result, index) => {
    const railKey = railKeys[index];
    if (result.status === 'fulfilled') {
      rails[railKey] = { items: result.value.items, error: null };
    } else {
      rails[railKey] = { items: [], error: getErrorMessage(result.reason) };
    }
  });

  return {
    filters: { ...filters },
    rails,
    generatedAt: new Date().toISOString(),
  };
}

const getCachedDiscoveryResponse = unstable_cache(
  async (filters: DiscoveryFilters) => fetchDiscoveryResponse(filters),
  ['discovery-rails-v2'],
  {
    revalidate: 300,
    tags: ['discovery:rails'],
  }
);

export async function getDiscoveryResponse(filters: DiscoveryFilters): Promise<DiscoveryResponse> {
  return getCachedDiscoveryResponse(filters);
}
