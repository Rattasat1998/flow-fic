-- ============================================
-- FlowFic — Local choices only (single-chapter ending)
-- - Choices no longer link to another chapter
-- - Selecting a choice ends in the current chapter
-- ============================================

-- 1) Allow nullable target and remove self-loop constraint
alter table if exists public.chapter_choices
  alter column to_chapter_id drop not null;

alter table if exists public.chapter_choices
  add column if not exists outcome_text text;

alter table if exists public.chapter_choices
  drop constraint if exists chapter_choices_no_self_loop;

-- 2) Backfill legacy rows: remove cross-chapter target links
update public.chapter_choices
set to_chapter_id = null
where to_chapter_id is not null;

-- 3) Adjust select policy: no target chapter dependency
-- Reader should only require published story + published source chapter.
drop policy if exists "chapter_choices_select_story_visible" on public.chapter_choices;

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
      where s.id = chapter_choices.story_id
        and s.status = 'published'
        and fc.status = 'published'
    )
  );

-- 4) Consistency trigger: validate source chapter + story + text,
-- and force local-choice mode by nulling target chapter.
create or replace function public.ensure_chapter_choice_story_consistency()
returns trigger
language plpgsql
as $$
declare
  v_from_story_id uuid;
begin
  select c.story_id into v_from_story_id
  from public.chapters c
  where c.id = new.from_chapter_id;

  if v_from_story_id is null then
    raise exception 'CHOICE_CHAPTER_NOT_FOUND';
  end if;

  if new.story_id is null then
    new.story_id := v_from_story_id;
  end if;

  if new.story_id <> v_from_story_id then
    raise exception 'CHOICE_STORY_MISMATCH';
  end if;

  new.choice_text := coalesce(trim(new.choice_text), '');
  if new.choice_text = '' then
    raise exception 'CHOICE_TEXT_REQUIRED';
  end if;

  new.outcome_text := nullif(trim(coalesce(new.outcome_text, '')), '');

  -- Deprecated in local-choice mode.
  new.to_chapter_id := null;

  return new;
end;
$$;

-- 5) Writer RPC: replace choices for one chapter
-- Keep payload compatibility; ignore to_chapter_id if provided.
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
  v_choice_text text;
  v_outcome_text text;
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
    v_outcome_text := nullif(trim(coalesce(v_item->>'outcome_text', '')), '');

    v_order_index := coalesce((v_item->>'order_index')::int, v_count);

    insert into public.chapter_choices (
      story_id,
      from_chapter_id,
      to_chapter_id,
      choice_text,
      outcome_text,
      order_index
    )
    values (
      p_story_id,
      p_from_chapter_id,
      null,
      v_choice_text,
      v_outcome_text,
      v_order_index
    );

    v_count := v_count + 1;
  end loop;
end;
$$;

revoke all on function public.replace_chapter_choices(uuid, uuid, jsonb) from public;
grant execute on function public.replace_chapter_choices(uuid, uuid, jsonb)
  to authenticated;

-- 6) Reader RPC: local choices only (no target chapter join)
-- PostgreSQL cannot change OUT column shape via CREATE OR REPLACE.
drop function if exists public.get_reader_chapter_choices(uuid, uuid, boolean);

create function public.get_reader_chapter_choices(
  p_story_id uuid,
  p_from_chapter_id uuid,
  p_preview_mode boolean default false
)
returns table (
  id uuid,
  choice_text text,
  outcome_text text,
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
  select
    cc.id,
    cc.choice_text,
    cc.outcome_text,
    cc.order_index,
    null::uuid as to_chapter_id,
    null::text as to_title,
    0::int as to_order_index,
    false as is_premium,
    0::int as coin_price,
    true as can_read,
    'local'::text as access_source
  from public.chapter_choices cc
  join public.chapters fc on fc.id = cc.from_chapter_id
  where cc.story_id = p_story_id
    and cc.from_chapter_id = p_from_chapter_id
    and (p_preview_mode or fc.status = 'published')
  order by cc.order_index asc, cc.created_at asc;
end;
$$;

revoke all on function public.get_reader_chapter_choices(uuid, uuid, boolean) from public;
grant execute on function public.get_reader_chapter_choices(uuid, uuid, boolean)
  to anon, authenticated, service_role;
