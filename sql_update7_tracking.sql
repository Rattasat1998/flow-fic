-- ============================================
-- FlowFic — Customer Tracking & Event Analytics
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Create page_events table
create table if not exists public.page_events (
  id uuid primary key default gen_random_uuid(),
  -- User / Session context
  user_id uuid references auth.users(id) on delete set null,
  session_id text not null,
  -- Event data
  event_type text not null,
  page_path text not null,
  -- Context references
  story_id uuid references public.stories(id) on delete set null,
  chapter_id uuid references public.chapters(id) on delete set null,
  -- Flexible metadata
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

-- 2. Performance indexes
create index if not exists page_events_user_idx
  on public.page_events(user_id, created_at desc);

create index if not exists page_events_event_type_idx
  on public.page_events(event_type, created_at desc);

create index if not exists page_events_story_idx
  on public.page_events(story_id, created_at desc);

create index if not exists page_events_session_idx
  on public.page_events(session_id, created_at desc);

-- 3. Enable RLS
alter table public.page_events enable row level security;

-- 4. RLS Policies
-- Anyone can insert events (including anonymous users)
create policy "Anyone can insert page events"
  on public.page_events for insert with check (true);

-- Users can view their own events
create policy "Users can view their own page events"
  on public.page_events for select using (auth.uid() = user_id);

-- Service-role can read all (for admin dashboard via API route)
-- (service_role bypasses RLS by default, no policy needed)
