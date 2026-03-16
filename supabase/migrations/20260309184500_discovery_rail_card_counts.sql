-- FlowFic — Discovery rail card metrics (episode/view/like)

DROP FUNCTION IF EXISTS public.get_discovery_rail(text, text, text, text, text, text, boolean, integer);

CREATE OR REPLACE FUNCTION public.get_discovery_rail(
  p_rail text,
  p_q text DEFAULT NULL,
  p_category text DEFAULT 'all',
  p_sub_category text DEFAULT 'all',
  p_completion text DEFAULT 'all',
  p_length text DEFAULT 'all',
  p_focus_core boolean DEFAULT false,
  p_limit int DEFAULT 12
)
RETURNS TABLE (
  id uuid,
  title text,
  pen_name text,
  cover_url text,
  cover_wide_url text,
  synopsis text,
  category text,
  main_category text,
  sub_category text,
  path_mode text,
  completion_status text,
  created_at timestamptz,
  published_chapter_count int,
  total_view_count int,
  total_like_count int,
  score_7d double precision,
  score_30d double precision
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH chapter_counts AS (
    SELECT
      c.story_id,
      count(*)::int AS published_chapter_count
    FROM public.chapters c
    WHERE c.status = 'published'
    GROUP BY c.story_id
  ),
  chapter_views AS (
    SELECT
      c.story_id,
      coalesce(sum(c.read_count), 0)::int AS total_view_count
    FROM public.chapters c
    WHERE c.status = 'published'
    GROUP BY c.story_id
  ),
  likes_counts AS (
    SELECT
      l.story_id,
      count(*)::int AS total_like_count
    FROM public.likes l
    GROUP BY l.story_id
  ),
  base AS (
    SELECT
      s.id,
      s.title,
      s.pen_name,
      s.cover_url,
      s.cover_wide_url,
      s.synopsis,
      s.category,
      s.main_category,
      s.sub_category,
      s.path_mode,
      s.completion_status,
      s.created_at,
      coalesce(cc.published_chapter_count, 0) AS published_chapter_count,
      coalesce(cv.total_view_count, s.read_count, 0) AS total_view_count,
      coalesce(lc.total_like_count, 0) AS total_like_count,
      coalesce(r.score_7d, 0) AS score_7d,
      coalesce(r.score_30d, 0) AS score_30d,
      CASE
        WHEN coalesce(p_focus_core, false)
          AND s.sub_category IN ('mystery_horror', 'mystery_detective')
        THEN 0
        WHEN coalesce(p_focus_core, false)
        THEN 1
        ELSE 0
      END AS core_priority
    FROM public.stories s
    LEFT JOIN chapter_counts cc ON cc.story_id = s.id
    LEFT JOIN chapter_views cv ON cv.story_id = s.id
    LEFT JOIN likes_counts lc ON lc.story_id = s.id
    LEFT JOIN public.story_rankings_daily r ON r.story_id = s.id
    WHERE s.status = 'published'
      AND (
        coalesce(trim(p_q), '') = ''
        OR s.title ILIKE '%' || trim(p_q) || '%'
        OR coalesce(s.synopsis, '') ILIKE '%' || trim(p_q) || '%'
        OR s.pen_name ILIKE '%' || trim(p_q) || '%'
      )
      AND (
        coalesce(trim(p_category), '') = ''
        OR p_category = 'all'
        OR s.main_category = p_category
      )
      AND (
        coalesce(trim(p_sub_category), '') = ''
        OR p_sub_category = 'all'
        OR s.sub_category = p_sub_category
      )
      AND (
        coalesce(trim(p_completion), '') = ''
        OR p_completion = 'all'
        OR s.completion_status = p_completion
      )
      AND (
        p_length = 'all'
        OR p_length IS NULL
        OR (p_length = 'short' AND coalesce(cc.published_chapter_count, 0) BETWEEN 1 AND 5)
        OR (p_length = 'medium' AND coalesce(cc.published_chapter_count, 0) BETWEEN 6 AND 20)
        OR (p_length = 'long' AND coalesce(cc.published_chapter_count, 0) >= 21)
      )
  )
  SELECT
    b.id,
    b.title,
    b.pen_name,
    b.cover_url,
    b.cover_wide_url,
    b.synopsis,
    b.category,
    b.main_category,
    b.sub_category,
    b.path_mode,
    b.completion_status,
    b.created_at,
    b.published_chapter_count,
    b.total_view_count,
    b.total_like_count,
    b.score_7d,
    b.score_30d
  FROM base b
  ORDER BY
    b.core_priority ASC,
    CASE WHEN p_rail = 'new' THEN b.created_at END DESC NULLS LAST,
    CASE WHEN p_rail = 'popular' THEN b.score_30d END DESC NULLS LAST,
    CASE WHEN p_rail = 'trending' THEN b.score_7d END DESC NULLS LAST,
    b.score_7d DESC,
    b.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 12), 50));
$$;
