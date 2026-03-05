-- ============================================
-- FlowFic — Analytics Helper Functions
-- Run this AFTER sql_update7_tracking.sql
-- ============================================

-- 1. Overview: unique users & sessions since a given timestamp
create or replace function public.get_analytics_overview(p_since timestamptz)
returns table (unique_users bigint, unique_sessions bigint)
language sql
security definer
set search_path = public
as $$
  select
    count(distinct user_id)::bigint as unique_users,
    count(distinct session_id)::bigint as unique_sessions
  from public.page_events
  where created_at >= p_since;
$$;

-- 2. Event type breakdown: count per event_type since a given timestamp
create or replace function public.get_event_breakdown(p_since timestamptz)
returns table (event_type text, event_count bigint)
language sql
security definer
set search_path = public
as $$
  select
    event_type,
    count(*)::bigint as event_count
  from public.page_events
  where created_at >= p_since
  group by event_type
  order by event_count desc;
$$;

-- 3. Top stories by event count
create or replace function public.get_top_stories(p_since timestamptz, p_limit int default 10)
returns table (story_id uuid, story_title text, event_count bigint)
language sql
security definer
set search_path = public
as $$
  select
    pe.story_id,
    coalesce(s.title, 'Unknown') as story_title,
    count(*)::bigint as event_count
  from public.page_events pe
  left join public.stories s on s.id = pe.story_id
  where pe.created_at >= p_since
    and pe.story_id is not null
  group by pe.story_id, s.title
  order by event_count desc
  limit p_limit;
$$;

-- Grant execute to service_role (already has access via security definer, but explicit)
-- These functions are security definer so they run as the creator (superuser) 
-- regardless of who calls them. The API route uses service_role key.
