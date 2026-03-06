-- ============================================
-- Reader chapter access enforcement (backend/data layer)
-- - Expose chapter metadata for TOC
-- - Expose chapter content only when reader has entitlement
-- ============================================

create or replace function public.get_reader_chapters(
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

