-- FlowFic — Performance Wave 1 (data access consolidation)
-- Reader-first: reduce network fan-out by aggregating read bootstrap and writer metrics in RPCs.

create index if not exists idx_likes_story_id
  on public.likes(story_id);

create index if not exists idx_favorites_story_id
  on public.favorites(story_id);

create index if not exists idx_comments_story_created_id
  on public.comments(story_id, created_at, id);

drop function if exists public.get_writer_dashboard_metrics(uuid);

create function public.get_writer_dashboard_metrics(
  p_user_id uuid default auth.uid()
)
returns table (
  story_id uuid,
  views_count bigint,
  likes_count bigint,
  favorites_count bigint,
  comments_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_role text := auth.role();
begin
  if p_user_id is null then
    raise exception 'USER_REQUIRED';
  end if;

  if v_role <> 'service_role' and (v_caller_id is null or v_caller_id <> p_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  with owned_stories as (
    select s.id
    from public.stories s
    where s.user_id = p_user_id
  ),
  chapter_reads as (
    select
      c.story_id,
      coalesce(sum(c.read_count), 0)::bigint as views_count
    from public.chapters c
    join owned_stories os on os.id = c.story_id
    group by c.story_id
  ),
  likes_agg as (
    select
      l.story_id,
      count(*)::bigint as likes_count
    from public.likes l
    join owned_stories os on os.id = l.story_id
    group by l.story_id
  ),
  favorites_agg as (
    select
      f.story_id,
      count(*)::bigint as favorites_count
    from public.favorites f
    join owned_stories os on os.id = f.story_id
    group by f.story_id
  ),
  comments_agg as (
    select
      c.story_id,
      count(*)::bigint as comments_count
    from public.comments c
    join owned_stories os on os.id = c.story_id
    group by c.story_id
  )
  select
    os.id as story_id,
    coalesce(cr.views_count, 0) as views_count,
    coalesce(la.likes_count, 0) as likes_count,
    coalesce(fa.favorites_count, 0) as favorites_count,
    coalesce(ca.comments_count, 0) as comments_count
  from owned_stories os
  left join chapter_reads cr on cr.story_id = os.id
  left join likes_agg la on la.story_id = os.id
  left join favorites_agg fa on fa.story_id = os.id
  left join comments_agg ca on ca.story_id = os.id;
end;
$$;

revoke all on function public.get_writer_dashboard_metrics(uuid) from public;
grant execute on function public.get_writer_dashboard_metrics(uuid)
  to authenticated, service_role;

drop function if exists public.get_reader_bootstrap(uuid, boolean, uuid);

create function public.get_reader_bootstrap(
  p_story_id uuid,
  p_preview_mode boolean default false,
  p_preview_chapter_id uuid default null
)
returns table (
  story jsonb,
  chapters jsonb,
  characters jsonb,
  coin_balance int,
  is_vip_active boolean,
  unlocked_chapter_ids uuid[],
  reader_progress jsonb,
  like_count int,
  liked_chapter_id uuid,
  favorited_chapter_id uuid,
  comments jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_story_row public.stories%rowtype;
  v_allow_comments boolean := true;
begin
  if p_story_id is null then
    return;
  end if;

  if p_preview_mode then
    if v_user_id is null then
      return;
    end if;

    select s.*
      into v_story_row
    from public.stories s
    where s.id = p_story_id
    limit 1;

    if not found then
      return;
    end if;

    if v_story_row.user_id <> v_user_id then
      return;
    end if;
  else
    select s.*
      into v_story_row
    from public.stories s
    where s.id = p_story_id
      and s.status = 'published'
    limit 1;

    if not found then
      return;
    end if;
  end if;

  if jsonb_typeof(coalesce(v_story_row.settings, '{}'::jsonb)->'allowComments') = 'boolean' then
    v_allow_comments := coalesce((v_story_row.settings->>'allowComments')::boolean, true);
  else
    v_allow_comments := true;
  end if;

  return query
  with story_data as (
    select to_jsonb(story_row) as data
    from (
      select
        v_story_row.id,
        v_story_row.title,
        v_story_row.pen_name,
        v_story_row.cover_url,
        v_story_row.cover_wide_url,
        v_story_row.writing_style,
        coalesce(v_story_row.path_mode, 'linear') as path_mode,
        v_story_row.entry_chapter_id,
        v_story_row.settings,
        v_story_row.status,
        v_story_row.user_id
    ) as story_row
  ),
  chapter_data as (
    select coalesce(
      jsonb_agg(to_jsonb(c) order by c.order_index asc),
      '[]'::jsonb
    ) as data
    from public.get_reader_chapters(p_story_id, p_preview_mode, p_preview_chapter_id) c
  ),
  character_data as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'image_url', c.image_url
        )
        order by c.order_index asc
      ),
      '[]'::jsonb
    ) as data
    from public.characters c
    where c.story_id = p_story_id
  ),
  wallet_data as (
    select coalesce((
      select w.coin_balance
      from public.wallets w
      where v_user_id is not null
        and w.user_id = v_user_id
      limit 1
    ), 0) as balance
  ),
  vip_data as (
    select exists (
      select 1
      from public.vip_entitlements v
      where v_user_id is not null
        and v.user_id = v_user_id
        and v.status = 'active'
        and (v.current_period_end is null or v.current_period_end > now())
    ) as active
  ),
  unlock_data as (
    select coalesce(
      array_agg(u.chapter_id),
      array[]::uuid[]
    ) as ids
    from public.chapter_unlocks u
    where v_user_id is not null
      and u.user_id = v_user_id
      and u.story_id = p_story_id
  ),
  progress_data as (
    select (
      select jsonb_build_object(
        'last_chapter_id', rp.last_chapter_id,
        'last_chapter_index', rp.last_chapter_index,
        'chapter_states', rp.chapter_states,
        'updated_at', rp.updated_at
      )
      from public.reader_progress rp
      where v_user_id is not null
        and rp.user_id = v_user_id
        and rp.story_id = p_story_id
      order by rp.updated_at desc nulls last
      limit 1
    ) as data
  ),
  interaction_data as (
    select
      (select count(*)::int from public.likes l where l.story_id = p_story_id) as like_count,
      (
        select l.chapter_id
        from public.likes l
        where v_user_id is not null
          and l.story_id = p_story_id
          and l.user_id = v_user_id
        limit 1
      ) as liked_chapter_id,
      (
        select f.chapter_id
        from public.favorites f
        where v_user_id is not null
          and f.story_id = p_story_id
          and f.user_id = v_user_id
        order by f.created_at desc
        limit 1
      ) as favorited_chapter_id
  ),
  comment_data as (
    select case
      when v_allow_comments then coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', c.id,
              'user_id', c.user_id,
              'content', c.content,
              'created_at', c.created_at,
              'profiles', jsonb_build_object(
                'pen_name', p.pen_name,
                'avatar_url', p.avatar_url
              )
            )
            order by c.created_at asc
          )
          from (
            select c.id, c.user_id, c.content, c.created_at
            from public.comments c
            where c.story_id = p_story_id
            order by c.created_at asc
            limit 100
          ) c
          left join public.profiles p on p.id = c.user_id
        ),
        '[]'::jsonb
      )
      else '[]'::jsonb
    end as data
  )
  select
    sd.data as story,
    cd.data as chapters,
    chd.data as characters,
    wd.balance as coin_balance,
    vd.active as is_vip_active,
    ud.ids as unlocked_chapter_ids,
    pd.data as reader_progress,
    idt.like_count as like_count,
    idt.liked_chapter_id as liked_chapter_id,
    idt.favorited_chapter_id as favorited_chapter_id,
    cmd.data as comments
  from story_data sd
  cross join chapter_data cd
  cross join character_data chd
  cross join wallet_data wd
  cross join vip_data vd
  cross join unlock_data ud
  cross join progress_data pd
  cross join interaction_data idt
  cross join comment_data cmd;
end;
$$;

revoke all on function public.get_reader_bootstrap(uuid, boolean, uuid) from public;
grant execute on function public.get_reader_bootstrap(uuid, boolean, uuid)
  to anon, authenticated, service_role;
