-- FlowFic — Chapter read counter with session dedupe

create table if not exists public.chapter_read_sessions (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  session_id text not null,
  created_at timestamptz not null default now(),
  constraint chapter_read_sessions_chapter_session_unique unique (chapter_id, session_id)
);

create index if not exists chapter_read_sessions_story_idx
  on public.chapter_read_sessions(story_id, created_at desc);

create index if not exists chapter_read_sessions_created_idx
  on public.chapter_read_sessions(created_at desc);

alter table if exists public.chapter_read_sessions enable row level security;

grant select, insert, update, delete on table public.chapter_read_sessions to service_role;

drop function if exists public.record_chapter_read(uuid, uuid, text);

create or replace function public.record_chapter_read(
  p_story_id uuid,
  p_chapter_id uuid,
  p_session_id text
)
returns table (
  counted boolean,
  read_count int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_story_owner_id uuid;
  v_story_status text;
  v_chapter_status text;
  v_next_read_count int := 0;
  v_inserted_count int := 0;
  v_session_id text := nullif(trim(p_session_id), '');
begin
  if p_story_id is null or p_chapter_id is null or v_session_id is null then
    return query select false, null::int;
    return;
  end if;

  select
    s.user_id,
    s.status,
    c.status,
    coalesce(c.read_count, 0)
  into
    v_story_owner_id,
    v_story_status,
    v_chapter_status,
    v_next_read_count
  from public.chapters c
  join public.stories s on s.id = c.story_id
  where c.id = p_chapter_id
    and c.story_id = p_story_id
  limit 1;

  if v_story_owner_id is null then
    return query select false, null::int;
    return;
  end if;

  if v_story_status <> 'published' or v_chapter_status <> 'published' then
    return query select false, v_next_read_count;
    return;
  end if;

  if v_user_id is not null and v_user_id = v_story_owner_id then
    return query select false, v_next_read_count;
    return;
  end if;

  insert into public.chapter_read_sessions (
    story_id,
    chapter_id,
    user_id,
    session_id
  )
  values (
    p_story_id,
    p_chapter_id,
    v_user_id,
    v_session_id
  )
  on conflict (chapter_id, session_id) do nothing;

  get diagnostics v_inserted_count = row_count;

  if v_inserted_count = 0 then
    return query select false, v_next_read_count;
    return;
  end if;

  update public.chapters
  set read_count = coalesce(read_count, 0) + 1
  where id = p_chapter_id
  returning chapters.read_count into v_next_read_count;

  insert into public.page_events (
    user_id,
    session_id,
    event_type,
    page_path,
    story_id,
    chapter_id,
    metadata
  )
  values (
    v_user_id,
    v_session_id,
    'chapter_read',
    '/story/' || p_story_id::text || '/read',
    p_story_id,
    p_chapter_id,
    jsonb_build_object('method', 'reader_open')
  );

  return query select true, v_next_read_count;
end;
$$;

revoke all on function public.record_chapter_read(uuid, uuid, text) from public;
grant execute on function public.record_chapter_read(uuid, uuid, text)
  to anon, authenticated, service_role;
