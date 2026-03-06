-- ============================================
-- Close direct premium-content leakage on chapters table
-- - Recreate get_reader_chapters with metadata fields used by story details
-- - Enforce chapter SELECT at row level (owner/free/unlocked/vip only)
-- ============================================

drop function if exists public.get_reader_chapters(uuid, boolean, uuid);

create function public.get_reader_chapters(
  p_story_id uuid,
  p_preview_mode boolean default false,
  p_preview_chapter_id uuid default null
)
returns table (
  id uuid,
  title text,
  order_index int,
  is_premium boolean,
  coin_price int,
  read_count int,
  created_at timestamptz,
  can_read boolean,
  access_source text,
  content_payload jsonb
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
  if p_story_id is null then
    return;
  end if;

  if p_preview_mode then
    select s.user_id
      into v_story_owner_id
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
    select s.user_id
      into v_story_owner_id
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
  ),
  chapter_base as (
    select
      c.id,
      case
        when p_preview_mode then coalesce(c.draft_title, c.title, c.published_title, 'ไม่มีชื่อ')
        else coalesce(c.published_title, c.title, 'ไม่มีชื่อ')
      end as title,
      c.order_index,
      c.is_premium,
      coalesce(c.coin_price, 0) as coin_price,
      coalesce(c.read_count, 0) as read_count,
      c.created_at,
      case
        when p_preview_mode then to_jsonb(coalesce(c.draft_content, c.content, c.published_content))
        else to_jsonb(coalesce(c.published_content, c.content))
      end as source_content
    from public.chapters c
    where c.story_id = p_story_id
      and (p_preview_mode or c.status = 'published')
      and (p_preview_chapter_id is null or c.id = p_preview_chapter_id)
  )
  select
    b.id,
    b.title,
    b.order_index,
    b.is_premium,
    b.coin_price,
    b.read_count,
    b.created_at,
    (
      v_is_owner
      or (not b.is_premium)
      or (b.coin_price <= 0)
      or (select active from vip)
      or exists (select 1 from unlocked u where u.chapter_id = b.id)
    ) as can_read,
    case
      when v_is_owner then 'owner'
      when not b.is_premium or b.coin_price <= 0 then 'free'
      when (select active from vip) then 'vip'
      when exists (select 1 from unlocked u where u.chapter_id = b.id) then 'unlock'
      else 'locked'
    end as access_source,
    case
      when (
        v_is_owner
        or (not b.is_premium)
        or (b.coin_price <= 0)
        or (select active from vip)
        or exists (select 1 from unlocked u where u.chapter_id = b.id)
      )
      then b.source_content
      else null::jsonb
    end as content_payload
  from chapter_base b
  order by b.order_index asc;
end;
$$;

revoke all on function public.get_reader_chapters(uuid, boolean, uuid) from public;
grant execute on function public.get_reader_chapters(uuid, boolean, uuid)
  to anon, authenticated, service_role;

alter table public.chapters enable row level security;

do $$
declare
  v_policy record;
begin
  for v_policy in
    select p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'chapters'
  loop
    execute format('drop policy if exists %I on public.chapters', v_policy.policyname);
  end loop;
end;
$$;

create policy "chapters_select_owner_or_entitled" on public.chapters
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.stories s
      where s.id = chapters.story_id
        and s.user_id = auth.uid()
    )
    or (
      chapters.status = 'published'
      and (
        coalesce(chapters.is_premium, false) = false
        or coalesce(chapters.coin_price, 0) <= 0
        or exists (
          select 1
          from public.chapter_unlocks u
          where u.chapter_id = chapters.id
            and u.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.vip_entitlements v
          where v.user_id = auth.uid()
            and v.status = 'active'
            and (v.current_period_end is null or v.current_period_end > now())
        )
      )
    )
  );

create policy "chapters_insert_owner_only" on public.chapters
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.stories s
      where s.id = chapters.story_id
        and s.user_id = auth.uid()
    )
  );

create policy "chapters_update_owner_only" on public.chapters
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.stories s
      where s.id = chapters.story_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.stories s
      where s.id = chapters.story_id
        and s.user_id = auth.uid()
    )
  );

create policy "chapters_delete_owner_only" on public.chapters
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.stories s
      where s.id = chapters.story_id
        and s.user_id = auth.uid()
    )
  );

