-- ============================================
-- FlowFic — Restore cross-chapter branching
-- - Choices link to target chapters again
-- - Keep outcome_text for backward compatibility
-- ============================================

alter table if exists public.chapter_choices
  add column if not exists outcome_text text;

alter table if exists public.chapter_choices
  drop constraint if exists chapter_choices_no_self_loop;

alter table if exists public.chapter_choices
  add constraint chapter_choices_no_self_loop
  check (to_chapter_id is null or from_chapter_id <> to_chapter_id);

-- Reader visibility should include published source+target chapters.
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
      join public.chapters tc on tc.id = chapter_choices.to_chapter_id
      where s.id = chapter_choices.story_id
        and s.status = 'published'
        and fc.status = 'published'
        and tc.status = 'published'
    )
  );

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

  if v_from_story_id is null then
    raise exception 'CHOICE_CHAPTER_NOT_FOUND';
  end if;

  if new.to_chapter_id is null then
    raise exception 'CHOICE_TARGET_REQUIRED';
  end if;

  select c.story_id into v_to_story_id
  from public.chapters c
  where c.id = new.to_chapter_id;

  if v_to_story_id is null then
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

  new.outcome_text := nullif(trim(coalesce(new.outcome_text, '')), '');

  return new;
end;
$$;

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
      outcome_text,
      order_index
    )
    values (
      p_story_id,
      p_from_chapter_id,
      v_to_chapter_id,
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
    cc.outcome_text,
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
