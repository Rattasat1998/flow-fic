-- FlowFic — Wide cover support for homepage hero

alter table if exists public.stories
  add column if not exists cover_wide_url text;

drop function if exists public.get_discovery_rail(text, text, text, text, text, text, boolean, integer);

create or replace function public.get_discovery_rail(
  p_rail text,
  p_q text default null,
  p_category text default 'all',
  p_sub_category text default 'all',
  p_completion text default 'all',
  p_length text default 'all',
  p_focus_core boolean default false,
  p_limit int default 12
)
returns table (
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
  score_7d double precision,
  score_30d double precision
)
language sql
security definer
set search_path = public
as $$
  with chapter_counts as (
    select
      c.story_id,
      count(*)::int as published_chapter_count
    from public.chapters c
    where c.status = 'published'
    group by c.story_id
  ),
  base as (
    select
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
      coalesce(cc.published_chapter_count, 0) as published_chapter_count,
      coalesce(r.score_7d, 0) as score_7d,
      coalesce(r.score_30d, 0) as score_30d,
      case
        when coalesce(p_focus_core, false)
          and s.sub_category in ('mystery_horror', 'mystery_detective')
        then 0
        when coalesce(p_focus_core, false)
        then 1
        else 0
      end as core_priority
    from public.stories s
    left join chapter_counts cc on cc.story_id = s.id
    left join public.story_rankings_daily r on r.story_id = s.id
    where s.status = 'published'
      and (
        coalesce(trim(p_q), '') = ''
        or s.title ilike '%' || trim(p_q) || '%'
        or coalesce(s.synopsis, '') ilike '%' || trim(p_q) || '%'
        or s.pen_name ilike '%' || trim(p_q) || '%'
      )
      and (
        coalesce(trim(p_category), '') = ''
        or p_category = 'all'
        or s.main_category = p_category
      )
      and (
        coalesce(trim(p_sub_category), '') = ''
        or p_sub_category = 'all'
        or s.sub_category = p_sub_category
      )
      and (
        coalesce(trim(p_completion), '') = ''
        or p_completion = 'all'
        or s.completion_status = p_completion
      )
      and (
        p_length = 'all'
        or p_length is null
        or (p_length = 'short' and coalesce(cc.published_chapter_count, 0) between 1 and 5)
        or (p_length = 'medium' and coalesce(cc.published_chapter_count, 0) between 6 and 20)
        or (p_length = 'long' and coalesce(cc.published_chapter_count, 0) >= 21)
      )
  )
  select
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
    b.score_7d,
    b.score_30d
  from base b
  order by
    b.core_priority asc,
    case when p_rail = 'new' then b.created_at end desc nulls last,
    case when p_rail = 'popular' then b.score_30d end desc nulls last,
    case when p_rail = 'trending' then b.score_7d end desc nulls last,
    b.score_7d desc,
    b.created_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;
