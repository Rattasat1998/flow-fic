-- FlowFic — Schema reconciliation phase 1
-- Source-of-truth migration for legacy sql_update scripts that were applied outside supabase/migrations.

create table if not exists public.page_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id text not null,
  event_type text not null,
  page_path text not null,
  story_id uuid references public.stories(id) on delete set null,
  chapter_id uuid references public.chapters(id) on delete set null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists page_events_user_idx
  on public.page_events(user_id, created_at desc);

create index if not exists page_events_event_type_idx
  on public.page_events(event_type, created_at desc);

create index if not exists page_events_story_idx
  on public.page_events(story_id, created_at desc);

create index if not exists page_events_session_idx
  on public.page_events(session_id, created_at desc);

alter table if exists public.page_events enable row level security;

drop policy if exists "Anyone can insert page events" on public.page_events;
create policy "Anyone can insert page events"
  on public.page_events
  for insert
  with check (true);

drop policy if exists "Users can view their own page events" on public.page_events;
create policy "Users can view their own page events"
  on public.page_events
  for select
  using (auth.uid() = user_id);

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

create table if not exists public.follows (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  created_at timestamptz default now() not null,
  constraint follows_unique_user_story unique (user_id, story_id)
);

create index if not exists idx_follows_user on public.follows(user_id);
create index if not exists idx_follows_story on public.follows(story_id);

alter table if exists public.follows enable row level security;

drop policy if exists "Users can view own follows" on public.follows;
create policy "Users can view own follows"
  on public.follows
  for select
  using (auth.uid() = user_id);

drop policy if exists "Anyone can count follows per story" on public.follows;
create policy "Anyone can count follows per story"
  on public.follows
  for select
  using (true);

drop policy if exists "Users can follow stories" on public.follows;
create policy "Users can follow stories"
  on public.follows
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can unfollow stories" on public.follows;
create policy "Users can unfollow stories"
  on public.follows
  for delete
  using (auth.uid() = user_id);

create table if not exists public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'new_chapter',
  title text not null,
  body text,
  link text,
  metadata jsonb default '{}'::jsonb,
  is_read boolean default false not null,
  created_at timestamptz default now() not null
);

create index if not exists idx_notifications_user_unread
  on public.notifications(user_id, is_read, created_at desc);

create index if not exists idx_notifications_user_created
  on public.notifications(user_id, created_at desc);

alter table if exists public.notifications enable row level security;

drop policy if exists "Users can view own notifications" on public.notifications;
create policy "Users can view own notifications"
  on public.notifications
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications"
  on public.notifications
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.notify_followers_on_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_story_id uuid;
  v_story_title text;
  v_chapter_title text;
  v_follower_id uuid;
begin
  if (
    TG_OP = 'UPDATE'
    and old.status is distinct from 'published'
    and new.status = 'published'
  ) then
    v_story_id := new.story_id;
    v_chapter_title := new.title;

    select title
      into v_story_title
    from public.stories
    where id = v_story_id;

    for v_follower_id in
      select user_id
      from public.follows
      where story_id = v_story_id
    loop
      insert into public.notifications (user_id, type, title, body, link, metadata)
      values (
        v_follower_id,
        'new_chapter',
        'ตอนใหม่: ' || coalesce(v_chapter_title, 'ไม่มีชื่อ'),
        'เรื่อง "' || coalesce(v_story_title, '') || '" มีตอนใหม่แล้ว',
        '/story/' || v_story_id::text || '/read?chapter=' || new.order_index::text,
        jsonb_build_object(
          'story_id', v_story_id,
          'chapter_id', new.id,
          'chapter_title', v_chapter_title,
          'story_title', v_story_title
        )
      );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_followers_on_publish on public.chapters;
create trigger trg_notify_followers_on_publish
  after update on public.chapters
  for each row
  execute function public.notify_followers_on_publish();

create table if not exists public.chapter_revisions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision_type text not null default 'manual_save'
    check (revision_type in ('manual_save', 'publish', 'discard', 'restore')),
  title text not null,
  content jsonb not null default '{}'::jsonb,
  is_premium boolean not null default false,
  coin_price integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_chapter_revisions_chapter_created
  on public.chapter_revisions(chapter_id, created_at desc);

create index if not exists idx_chapter_revisions_user_created
  on public.chapter_revisions(user_id, created_at desc);

alter table if exists public.chapter_revisions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'chapter_revisions'
      and policyname = 'Users can view own chapter revisions'
  ) then
    create policy "Users can view own chapter revisions"
      on public.chapter_revisions
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'chapter_revisions'
      and policyname = 'Users can insert own chapter revisions'
  ) then
    create policy "Users can insert own chapter revisions"
      on public.chapter_revisions
      for insert
      with check (auth.uid() = user_id);
  end if;
end;
$$;

create index if not exists idx_chapters_story_status_order
  on public.chapters(story_id, status, order_index);

create index if not exists idx_chapters_story_published_updated
  on public.chapters(story_id, status, updated_at desc)
  where status = 'published';
