export type DiscoveryRailKey = 'new' | 'popular' | 'trending';

export type DiscoveryCompletionFilter = 'all' | 'ongoing' | 'completed';
export type DiscoveryLengthFilter = 'all' | 'short' | 'medium' | 'long';
export type DiscoveryCategoryFilter = 'all' | string;
export type DiscoverySubCategoryFilter = 'all' | string;

export interface DiscoveryFilters {
  q: string;
  category: DiscoveryCategoryFilter;
  subCategory: DiscoverySubCategoryFilter;
  completion: DiscoveryCompletionFilter;
  length: DiscoveryLengthFilter;
  focusCore: boolean;
  limit: number;
  offset: number;
}

export interface DiscoveryStory {
  id: string;
  title: string;
  pen_name: string;
  cover_url: string | null;
  cover_wide_url: string | null;
  synopsis: string | null;
  category: string;
  main_category: string | null;
  sub_category: string | null;
  writing_style: string | null;
  path_mode: 'linear' | 'branching';
  completion_status: string | null;
  created_at: string | null;
  published_chapter_count: number;
  total_view_count: number;
  total_like_count: number;
  score_7d: number;
  score_30d: number;
}

export interface DiscoveryRailPayload {
  items: DiscoveryStory[];
  error: string | null;
}

export interface DiscoveryResponse {
  filters: DiscoveryFilters;
  rails: Record<DiscoveryRailKey, DiscoveryRailPayload>;
  generatedAt: string;
}
