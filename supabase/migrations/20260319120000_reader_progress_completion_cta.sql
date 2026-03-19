-- FlowFic — Reader completion summary + CTA story versioning

alter table if exists public.reader_progress
  add column if not exists completed_at timestamptz;

alter table if exists public.reader_progress
  add column if not exists completed_chapter_id uuid references public.chapters(id) on delete set null;

alter table if exists public.reader_progress
  add column if not exists completed_story_version text;

drop function if exists public.get_story_progress_version(uuid);

create function public.get_story_progress_version(
  p_story_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_story_row public.stories%rowtype;
  v_is_owner boolean := false;
  v_payload jsonb;
begin
  if p_story_id is null then
    return null;
  end if;

  select s.*
    into v_story_row
  from public.stories s
  where s.id = p_story_id
  limit 1;

  if not found then
    return null;
  end if;

  v_is_owner := v_user_id is not null and v_story_row.user_id = v_user_id;

  if v_story_row.status <> 'published' and not v_is_owner then
    return null;
  end if;

  with visible_chapters as (
    select
      c.id,
      c.order_index,
      coalesce(
        (
          case
            when jsonb_typeof(coalesce(c.published_content, c.content, '{}'::jsonb)) = 'object'
              then (coalesce(c.published_content, c.content, '{}'::jsonb)->>'isEnding')::boolean
            else null
          end
        ),
        false
      ) as is_ending
    from public.chapters c
    where c.story_id = p_story_id
      and (
        (v_story_row.status = 'published' and c.status = 'published')
        or (v_story_row.status <> 'published' and v_is_owner)
      )
  ),
  visible_choices as (
    select
      cc.from_chapter_id,
      cc.to_chapter_id,
      cc.order_index
    from public.chapter_choices cc
    join public.chapters fc on fc.id = cc.from_chapter_id
    join public.chapters tc on tc.id = cc.to_chapter_id
    where cc.story_id = p_story_id
      and (
        (v_story_row.status = 'published' and fc.status = 'published' and tc.status = 'published')
        or (v_story_row.status <> 'published' and v_is_owner)
      )
  )
  select jsonb_build_object(
    'path_mode', coalesce(v_story_row.path_mode, 'linear'),
    'entry_chapter_id', v_story_row.entry_chapter_id,
    'chapters', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', vc.id,
            'order_index', vc.order_index,
            'is_ending', vc.is_ending
          )
          order by vc.order_index asc, vc.id asc
        )
        from visible_chapters vc
      ),
      '[]'::jsonb
    ),
    'choices', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'from_chapter_id', vch.from_chapter_id,
            'to_chapter_id', vch.to_chapter_id,
            'order_index', vch.order_index
          )
          order by vch.from_chapter_id asc, vch.order_index asc, vch.to_chapter_id asc
        )
        from visible_choices vch
      ),
      '[]'::jsonb
    )
  )
    into v_payload;

  return md5(coalesce(v_payload::text, '{}'::text));
end;
$$;

revoke all on function public.get_story_progress_version(uuid) from public;
grant execute on function public.get_story_progress_version(uuid)
  to anon, authenticated, service_role;

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
  story_progress_version text,
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
        'updated_at', rp.updated_at,
        'completed_at', rp.completed_at,
        'completed_chapter_id', rp.completed_chapter_id,
        'completed_story_version', rp.completed_story_version
      )
      from public.reader_progress rp
      where v_user_id is not null
        and rp.user_id = v_user_id
        and rp.story_id = p_story_id
      order by rp.updated_at desc nulls last
      limit 1
    ) as data
  ),
  story_progress_version_data as (
    select public.get_story_progress_version(p_story_id) as data
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
    spvd.data as story_progress_version,
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
  cross join story_progress_version_data spvd
  cross join interaction_data idt
  cross join comment_data cmd;
end;
$$;

revoke all on function public.get_reader_bootstrap(uuid, boolean, uuid) from public;
grant execute on function public.get_reader_bootstrap(uuid, boolean, uuid)
  to anon, authenticated, service_role;
