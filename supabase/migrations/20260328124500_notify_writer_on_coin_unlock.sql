-- FlowFic: Notify writer when a reader unlocks premium chapter with coins

create or replace function public.notify_writer_on_coin_unlock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_writer_id uuid;
  v_story_title text;
  v_chapter_title text;
begin
  if coalesce(new.spent_coins, 0) <= 0 then
    return new;
  end if;

  select s.user_id, s.title
    into v_writer_id, v_story_title
  from public.stories s
  where s.id = new.story_id
  limit 1;

  if v_writer_id is null then
    return new;
  end if;

  -- Skip self-unlock to avoid noisy notifications while author is testing.
  if v_writer_id = new.user_id then
    return new;
  end if;

  select c.title
    into v_chapter_title
  from public.chapters c
  where c.id = new.chapter_id
  limit 1;

  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    link,
    metadata
  )
  values (
    v_writer_id,
    'chapter_unlock_coin',
    'มีผู้อ่านปลดล็อกตอนด้วยเหรียญ',
    '"' || coalesce(v_story_title, 'เรื่องของคุณ') || '" - '
      || coalesce(v_chapter_title, 'ตอนที่ปลดล็อก')
      || ' ใช้ ' || coalesce(new.spent_coins, 0)::text || ' coin',
    '/dashboard',
    jsonb_build_object(
      'story_id', new.story_id,
      'chapter_id', new.chapter_id,
      'unlock_id', new.id,
      'reader_user_id', new.user_id,
      'spent_coins', coalesce(new.spent_coins, 0)
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_writer_on_coin_unlock on public.chapter_unlocks;
create trigger trg_notify_writer_on_coin_unlock
  after insert on public.chapter_unlocks
  for each row
  execute function public.notify_writer_on_coin_unlock();
