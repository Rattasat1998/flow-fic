-- ============================================
-- FlowFic — Follow & Notification System
-- Run this in Supabase SQL Editor
-- ============================================

-- ─── 1. FOLLOWS TABLE ───────────────────────────
create table if not exists public.follows (
    id uuid default gen_random_uuid() primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    story_id uuid not null references public.stories(id) on delete cascade,
    created_at timestamptz default now() not null,

    -- Uniqueness: one follow per user per story
    constraint follows_unique_user_story unique (user_id, story_id)
);

-- Indexes
create index if not exists idx_follows_user on public.follows(user_id);
create index if not exists idx_follows_story on public.follows(story_id);

-- RLS
alter table public.follows enable row level security;

-- Users can see their own follows
create policy "Users can view own follows"
    on public.follows for select
    using (auth.uid() = user_id);

-- Anyone can check follow count per story (for display)
create policy "Anyone can count follows per story"
    on public.follows for select
    using (true);

-- Users can follow (insert)
create policy "Users can follow stories"
    on public.follows for insert
    with check (auth.uid() = user_id);

-- Users can unfollow (delete)
create policy "Users can unfollow stories"
    on public.follows for delete
    using (auth.uid() = user_id);


-- ─── 2. NOTIFICATIONS TABLE ────────────────────
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

-- Indexes
create index if not exists idx_notifications_user_unread
    on public.notifications(user_id, is_read, created_at desc);
create index if not exists idx_notifications_user_created
    on public.notifications(user_id, created_at desc);

-- RLS
alter table public.notifications enable row level security;

-- Users can read own notifications
create policy "Users can view own notifications"
    on public.notifications for select
    using (auth.uid() = user_id);

-- Users can mark own notifications as read
create policy "Users can update own notifications"
    on public.notifications for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- System inserts (via trigger) — uses security definer function
-- No direct insert policy needed for end users


-- ─── 3. CHAPTER PUBLISH NOTIFICATION TRIGGER ───
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
    -- Only fire when status changes TO 'published'
    if (TG_OP = 'UPDATE'
        and old.status is distinct from 'published'
        and new.status = 'published') then

        v_story_id := new.story_id;
        v_chapter_title := new.title;

        -- Get story title
        select title into v_story_title
        from public.stories
        where id = v_story_id;

        -- Fanout to all followers
        for v_follower_id in
            select user_id from public.follows where story_id = v_story_id
        loop
            insert into public.notifications (user_id, type, title, body, link, metadata)
            values (
                v_follower_id,
                'new_chapter',
                '📖 ตอนใหม่: ' || coalesce(v_chapter_title, 'ไม่มีชื่อ'),
                'เรื่อง "' || coalesce(v_story_title, '') || '" มีตอนใหม่แล้ว!',
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

-- Attach trigger to chapters table
drop trigger if exists trg_notify_followers_on_publish on public.chapters;
create trigger trg_notify_followers_on_publish
    after update on public.chapters
    for each row
    execute function public.notify_followers_on_publish();
