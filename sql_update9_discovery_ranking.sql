-- ============================================
-- FlowFic — Reader Discovery v1 (READ-301/302/303)
-- - Ranking service + daily refresh
-- - Discovery rails (new / popular / trending)
-- ============================================

-- 1) Daily ranking snapshot table
create table if not exists public.story_rankings_daily (
  story_id uuid primary key references public.stories(id) on delete cascade,
  views_7d integer not null default 0,
  views_30d integer not null default 0,
  likes_7d integer not null default 0,
  likes_30d integer not null default 0,
  recency_boost double precision not null default 0,
  score_7d double precision not null default 0,
  score_30d double precision not null default 0,
  refreshed_at timestamptz not null default now()
);

create index if not exists idx_story_rankings_score_7d
  on public.story_rankings_daily(score_7d desc);

create index if not exists idx_story_rankings_score_30d
  on public.story_rankings_daily(score_30d desc);

create index if not exists idx_story_rankings_refreshed_at
  on public.story_rankings_daily(refreshed_at desc);

-- 2) Supporting indexes for discovery queries
create index if not exists idx_stories_discovery_filters
  on public.stories(status, main_category, completion_status, created_at desc);

create index if not exists idx_likes_story_created
  on public.likes(story_id, created_at desc);

create index if not exists idx_page_events_discovery
  on public.page_events(event_type, story_id, created_at desc);

create index if not exists idx_chapters_story_status
  on public.chapters(story_id, status);

-- 3) Ranking refresh function (views + likes + recency decay)
create or replace function public.refresh_story_rankings_daily()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.story_rankings_daily (
    story_id,
    views_7d,
    views_30d,
    likes_7d,
    likes_30d,
    recency_boost,
    score_7d,
    score_30d,
    refreshed_at
  )
  with published_stories as (
    select s.id, s.created_at
    from public.stories s
    where s.status = 'published'
  ),
  views_agg as (
    select
      pe.story_id,
      count(*) filter (where pe.created_at >= now() - interval '7 days')::int as views_7d,
      count(*) filter (where pe.created_at >= now() - interval '30 days')::int as views_30d
    from public.page_events pe
    where pe.story_id is not null
      and pe.event_type in ('story_view', 'chapter_read')
      and pe.created_at >= now() - interval '30 days'
    group by pe.story_id
  ),
  likes_agg as (
    select
      l.story_id,
      count(*) filter (where l.created_at >= now() - interval '7 days')::int as likes_7d,
      count(*) filter (where l.created_at >= now() - interval '30 days')::int as likes_30d
    from public.likes l
    where l.created_at >= now() - interval '30 days'
    group by l.story_id
  )
  select
    ps.id as story_id,
    coalesce(v.views_7d, 0) as views_7d,
    coalesce(v.views_30d, 0) as views_30d,
    coalesce(l.likes_7d, 0) as likes_7d,
    coalesce(l.likes_30d, 0) as likes_30d,
    (50.0 * exp(-greatest(extract(epoch from (now() - ps.created_at)) / 86400.0, 0) / 14.0)) as recency_boost,
    (
      (coalesce(v.views_7d, 0) * 1.0)
      + (coalesce(l.likes_7d, 0) * 3.0)
      + (50.0 * exp(-greatest(extract(epoch from (now() - ps.created_at)) / 86400.0, 0) / 14.0))
    ) as score_7d,
    (
      (coalesce(v.views_30d, 0) * 1.0)
      + (coalesce(l.likes_30d, 0) * 3.0)
      + (50.0 * exp(-greatest(extract(epoch from (now() - ps.created_at)) / 86400.0, 0) / 14.0))
    ) as score_30d,
    now() as refreshed_at
  from published_stories ps
  left join views_agg v on v.story_id = ps.id
  left join likes_agg l on l.story_id = ps.id
  on conflict (story_id) do update
    set views_7d = excluded.views_7d,
        views_30d = excluded.views_30d,
        likes_7d = excluded.likes_7d,
        likes_30d = excluded.likes_30d,
        recency_boost = excluded.recency_boost,
        score_7d = excluded.score_7d,
        score_30d = excluded.score_30d,
        refreshed_at = excluded.refreshed_at;

  -- Remove stale rows for unpublished/deleted stories.
  delete from public.story_rankings_daily r
  where not exists (
    select 1
    from public.stories s
    where s.id = r.story_id
      and s.status = 'published'
  );
end;
$$;

-- 4) Discovery rail function
create or replace function public.get_discovery_rail(
  p_rail text,
  p_q text default null,
  p_category text default 'all',
  p_completion text default 'all',
  p_length text default 'all',
  p_limit int default 12
)
returns table (
  id uuid,
  title text,
  pen_name text,
  cover_url text,
  synopsis text,
  category text,
  main_category text,
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
      s.synopsis,
      s.category,
      s.main_category,
      s.completion_status,
      s.created_at,
      coalesce(cc.published_chapter_count, 0) as published_chapter_count,
      coalesce(r.score_7d, 0) as score_7d,
      coalesce(r.score_30d, 0) as score_30d
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
    b.synopsis,
    b.category,
    b.main_category,
    b.completion_status,
    b.created_at,
    b.published_chapter_count,
    b.score_7d,
    b.score_30d
  from base b
  order by
    case when p_rail = 'new' then b.created_at end desc nulls last,
    case when p_rail = 'popular' then b.score_30d end desc nulls last,
    case when p_rail = 'trending' then b.score_7d end desc nulls last,
    b.created_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;

-- 5) Initial refresh right after migration
select public.refresh_story_rankings_daily();

-- 6) Daily refresh job (00:10 UTC) via pg_cron
do $$
begin
  begin
    create extension if not exists pg_cron with schema extensions;
  exception
    when others then
      raise notice 'pg_cron extension not available: %', sqlerrm;
  end;

  begin
    if exists (
      select 1
      from pg_namespace
      where nspname = 'cron'
    ) then
      perform cron.unschedule(jobid)
      from cron.job
      where jobname = 'flowfic_refresh_story_rankings_daily';

      perform cron.schedule(
        'flowfic_refresh_story_rankings_daily',
        '10 0 * * *',
        'select public.refresh_story_rankings_daily();'
      );
    else
      raise notice 'cron schema not found, skip scheduling';
    end if;
  exception
    when others then
      raise notice 'Failed to schedule ranking refresh job: %', sqlerrm;
  end;
end;
$$;
