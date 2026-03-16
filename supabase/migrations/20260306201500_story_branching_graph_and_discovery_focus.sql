-- ============================================
-- FlowFic — Story Branching Graph + Discovery Focus
-- - Add story path mode (linear/branching)
-- - Add chapter choices graph
-- - Add reader choices RPC
-- - Update discovery rail RPC for sub-category + core focus bias
-- ============================================

-- 1) Story pathing columns
alter table if exists public.stories
  add column if not exists path_mode text not null default 'linear';

alter table if exists public.stories
  drop constraint if exists stories_path_mode_check;

alter table if exists public.stories
  add constraint stories_path_mode_check
  check (path_mode in ('linear', 'branching'));

alter table if exists public.stories
  add column if not exists entry_chapter_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stories_entry_chapter_id_fkey'
      and conrelid = 'public.stories'::regclass
  ) then
    alter table public.stories
      add constraint stories_entry_chapter_id_fkey
      foreign key (entry_chapter_id)
      references public.chapters(id)
      on delete set null;
  end if;
end;
$$;

-- Keep existing data deterministic
update public.stories s
set path_mode = 'linear'
where s.path_mode is null
   or s.path_mode not in ('linear', 'branching');

update public.stories s
set entry_chapter_id = first_chapter.id
from (
  select distinct on (c.story_id)
    c.story_id,
    c.id
  from public.chapters c
  order by c.story_id, c.order_index asc, c.created_at asc
) as first_chapter
where s.entry_chapter_id is null
  and first_chapter.story_id = s.id;

-- 2) Chapter choices graph table
create table if not exists public.chapter_choices (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  from_chapter_id uuid not null references public.chapters(id) on delete cascade,
  to_chapter_id uuid not null references public.chapters(id) on delete cascade,
  choice_text text not null,
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(from_chapter_id, order_index)
);

alter table if exists public.chapter_choices
  drop constraint if exists chapter_choices_no_self_loop;

alter table if exists public.chapter_choices
  add constraint chapter_choices_no_self_loop
  check (from_chapter_id <> to_chapter_id);

create index if not exists chapter_choices_story_idx
  on public.chapter_choices(story_id);

create index if not exists chapter_choices_from_idx
  on public.chapter_choices(from_chapter_id, order_index asc);

create index if not exists chapter_choices_to_idx
  on public.chapter_choices(to_chapter_id);

drop trigger if exists on_chapter_choices_updated on public.chapter_choices;
create trigger on_chapter_choices_updated
  before update on public.chapter_choices
  for each row execute function public.handle_updated_at();

alter table public.chapter_choices enable row level security;

do $$
declare
  v_policy record;
begin
  for v_policy in
    select p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'chapter_choices'
  loop
    execute format('drop policy if exists %I on public.chapter_choices', v_policy.policyname);
  end loop;
end;
$$;

create policy "chapter_choices_select_story_visible" on public.chapter_choices
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.stories s
      where s.id = chapter_choices.story_id
        and s.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.stories s
      join public.chapters fc on fc.id = chapter_choices.from_chapter_id
      join public.chapters tc on tc.id = chapter_choices.to_chapter_id
      where s.id = chapter_choices.story_id
        and s.status = 'published'
        and fc.status = 'published'
        and tc.status = 'published'
    )
  );

create policy "chapter_choices_insert_owner_only" on public.chapter_choices
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.stories s
      where s.id = chapter_choices.story_id
        and s.user_id = auth.uid()
    )
  );

create policy "chapter_choices_update_owner_only" on public.chapter_choices
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.stories s
      where s.id = chapter_choices.story_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.stories s
      where s.id = chapter_choices.story_id
        and s.user_id = auth.uid()
    )
  );

create policy "chapter_choices_delete_owner_only" on public.chapter_choices
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.stories s
      where s.id = chapter_choices.story_id
        and s.user_id = auth.uid()
    )
  );

-- Ensure story consistency between choices and chapters
create or replace function public.ensure_chapter_choice_story_consistency()
returns trigger
language plpgsql
as $$
declare
  v_from_story_id uuid;
  v_to_story_id uuid;
begin
  select c.story_id into v_from_story_id
  from public.chapters c
  where c.id = new.from_chapter_id;

  select c.story_id into v_to_story_id
  from public.chapters c
  where c.id = new.to_chapter_id;

  if v_from_story_id is null or v_to_story_id is null then
    raise exception 'CHOICE_CHAPTER_NOT_FOUND';
  end if;

  if new.story_id is null then
    new.story_id := v_from_story_id;
  end if;

  if new.story_id <> v_from_story_id or new.story_id <> v_to_story_id then
    raise exception 'CHOICE_STORY_MISMATCH';
  end if;

  if new.from_chapter_id = new.to_chapter_id then
    raise exception 'CHOICE_SELF_LOOP_NOT_ALLOWED';
  end if;

  new.choice_text := coalesce(trim(new.choice_text), '');
  if new.choice_text = '' then
    raise exception 'CHOICE_TEXT_REQUIRED';
  end if;

  return new;
end;
$$;

drop trigger if exists on_chapter_choices_consistency on public.chapter_choices;
create trigger on_chapter_choices_consistency
  before insert or update on public.chapter_choices
  for each row execute function public.ensure_chapter_choice_story_consistency();

-- 3) Writer RPC: replace chapter choices (single call)
create or replace function public.replace_chapter_choices(
  p_story_id uuid,
  p_from_chapter_id uuid,
  p_choices jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_story_owner_id uuid;
  v_from_story_id uuid;
  v_item jsonb;
  v_to_chapter_id uuid;
  v_choice_text text;
  v_order_index int;
  v_count int := 0;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_story_id is null or p_from_chapter_id is null then
    raise exception 'INVALID_INPUT';
  end if;

  select s.user_id into v_story_owner_id
  from public.stories s
  where s.id = p_story_id;

  if v_story_owner_id is null then
    raise exception 'STORY_NOT_FOUND';
  end if;

  if v_story_owner_id <> v_user_id then
    raise exception 'FORBIDDEN';
  end if;

  select c.story_id into v_from_story_id
  from public.chapters c
  where c.id = p_from_chapter_id;

  if v_from_story_id is null or v_from_story_id <> p_story_id then
    raise exception 'FROM_CHAPTER_MISMATCH';
  end if;

  if p_choices is null then
    p_choices := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_choices) <> 'array' then
    raise exception 'CHOICES_MUST_BE_ARRAY';
  end if;

  if jsonb_array_length(p_choices) > 4 then
    raise exception 'CHOICE_LIMIT_EXCEEDED';
  end if;

  delete from public.chapter_choices cc
  where cc.story_id = p_story_id
    and cc.from_chapter_id = p_from_chapter_id;

  for v_item in
    select value from jsonb_array_elements(p_choices)
  loop
    v_choice_text := coalesce(trim(v_item->>'choice_text'), '');
    if v_choice_text = '' then
      raise exception 'CHOICE_TEXT_REQUIRED';
    end if;

    v_to_chapter_id := nullif(v_item->>'to_chapter_id', '')::uuid;
    if v_to_chapter_id is null then
      raise exception 'CHOICE_TARGET_REQUIRED';
    end if;

    if v_to_chapter_id = p_from_chapter_id then
      raise exception 'CHOICE_SELF_LOOP_NOT_ALLOWED';
    end if;

    if not exists (
      select 1
      from public.chapters c
      where c.id = v_to_chapter_id
        and c.story_id = p_story_id
    ) then
      raise exception 'CHOICE_TARGET_STORY_MISMATCH';
    end if;

    v_order_index := coalesce((v_item->>'order_index')::int, v_count);

    insert into public.chapter_choices (
      story_id,
      from_chapter_id,
      to_chapter_id,
      choice_text,
      order_index
    )
    values (
      p_story_id,
      p_from_chapter_id,
      v_to_chapter_id,
      v_choice_text,
      v_order_index
    );

    v_count := v_count + 1;
  end loop;
end;
$$;

revoke all on function public.replace_chapter_choices(uuid, uuid, jsonb) from public;
grant execute on function public.replace_chapter_choices(uuid, uuid, jsonb)
  to authenticated;

-- 4) Reader RPC: chapter choices with entitlement on target chapter
create or replace function public.get_reader_chapter_choices(
  p_story_id uuid,
  p_from_chapter_id uuid,
  p_preview_mode boolean default false
)
returns table (
  id uuid,
  choice_text text,
  order_index int,
  to_chapter_id uuid,
  to_title text,
  to_order_index int,
  is_premium boolean,
  coin_price int,
  can_read boolean,
  access_source text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_story_owner_id uuid;
  v_is_owner boolean := false;
begin
  if p_story_id is null or p_from_chapter_id is null then
    return;
  end if;

  if p_preview_mode then
    select s.user_id into v_story_owner_id
    from public.stories s
    where s.id = p_story_id
    limit 1;

    if v_story_owner_id is null then
      return;
    end if;

    v_is_owner := (v_user_id is not null and v_story_owner_id = v_user_id);
    if not v_is_owner then
      return;
    end if;
  else
    select s.user_id into v_story_owner_id
    from public.stories s
    where s.id = p_story_id
      and s.status = 'published'
    limit 1;

    if v_story_owner_id is null then
      return;
    end if;

    v_is_owner := (v_user_id is not null and v_story_owner_id = v_user_id);
  end if;

  return query
  with vip as (
    select exists (
      select 1
      from public.vip_entitlements v
      where v.user_id = v_user_id
        and v.status = 'active'
        and (v.current_period_end is null or v.current_period_end > now())
    ) as active
  ),
  unlocked as (
    select u.chapter_id
    from public.chapter_unlocks u
    where u.user_id = v_user_id
      and u.story_id = p_story_id
  )
  select
    cc.id,
    cc.choice_text,
    cc.order_index,
    cc.to_chapter_id,
    case
      when p_preview_mode then coalesce(tc.draft_title, tc.title, tc.published_title, 'ไม่มีชื่อ')
      else coalesce(tc.published_title, tc.title, 'ไม่มีชื่อ')
    end as to_title,
    tc.order_index as to_order_index,
    coalesce(tc.is_premium, false) as is_premium,
    coalesce(tc.coin_price, 0) as coin_price,
    (
      v_is_owner
      or (coalesce(tc.is_premium, false) = false)
      or (coalesce(tc.coin_price, 0) <= 0)
      or (select active from vip)
      or exists (select 1 from unlocked u where u.chapter_id = tc.id)
    ) as can_read,
    case
      when v_is_owner then 'owner'
      when coalesce(tc.is_premium, false) = false or coalesce(tc.coin_price, 0) <= 0 then 'free'
      when (select active from vip) then 'vip'
      when exists (select 1 from unlocked u where u.chapter_id = tc.id) then 'unlock'
      else 'locked'
    end as access_source
  from public.chapter_choices cc
  join public.chapters tc on tc.id = cc.to_chapter_id
  where cc.story_id = p_story_id
    and cc.from_chapter_id = p_from_chapter_id
    and (p_preview_mode or tc.status = 'published')
  order by cc.order_index asc, cc.created_at asc;
end;
$$;

revoke all on function public.get_reader_chapter_choices(uuid, uuid, boolean) from public;
grant execute on function public.get_reader_chapter_choices(uuid, uuid, boolean)
  to anon, authenticated, service_role;

-- 5) Discovery RPC v2 (sub-category + core focus bias)
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

drop function if exists public.get_discovery_rail(text, text, text, text, text, int);

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
