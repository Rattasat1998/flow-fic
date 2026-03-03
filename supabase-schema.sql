-- ============================================
-- FlowFic — Supabase Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Create stories table
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  pen_name text not null,
  category text not null default 'original', -- 'original' | 'fanfic'
  main_category text,
  sub_category text,
  fandom text,
  tags text[] default '{}',
  rating text not null default 'all', -- 'all' | '13+' | '18+'
  synopsis text,
  cover_url text,
  writing_style text not null default 'narrative', -- 'narrative' | 'chat' | 'thread'
  story_format text not null default 'multi', -- 'multi' | 'single'
  settings jsonb not null default '{
    "allowComments": true,
    "hideHeartCount": false
  }'::jsonb,
  status text not null default 'draft', -- 'draft' | 'published'
  completion_status text not null default 'ongoing', -- 'ongoing' | 'completed'
  read_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Auto-update updated_at on row change
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_stories_updated
  before update on public.stories
  for each row execute function public.handle_updated_at();

-- 3. Enable Row Level Security
alter table public.stories enable row level security;

-- 4. RLS Policies — Allow public read & insert for now (no auth yet)
create policy "Allow public read" on public.stories
  for select using (true);

create policy "Allow public insert" on public.stories
  for insert with check (true);

create policy "Allow public update" on public.stories
  for update using (true);

create policy "Allow public delete" on public.stories
  for delete using (true);

-- 5. Create storage bucket for cover images
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

-- 6. Storage policies — Allow public upload & read
create policy "Allow public cover upload" on storage.objects
  for insert with check (bucket_id = 'covers');

create policy "Allow public cover read" on storage.objects
  for select using (bucket_id = 'covers');

create policy "Allow public cover update" on storage.objects
  for update using (bucket_id = 'covers');

create policy "Allow public cover delete" on storage.objects
  for delete using (bucket_id = 'covers');

-- ============================================
-- Phase 2: Chapters
-- ============================================

-- 7. Create chapters table
create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  story_id uuid references public.stories(id) on delete cascade not null,
  title text not null,
  content jsonb default null,
  order_index int not null default 0,
  is_premium boolean not null default false,
  coin_price int not null default 0 check (coin_price >= 0),
  status text not null default 'draft', -- 'draft' | 'published'
  read_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 8. Trigger for chapters updated_at
create trigger on_chapters_updated
  before update on public.chapters
  for each row execute function public.handle_updated_at();

-- 9. Enable Row Level Security for chapters
alter table public.chapters enable row level security;

-- 10. RLS Policies for chapters
create policy "Allow public read chapters" on public.chapters
  for select using (true);

create policy "Allow public insert chapters" on public.chapters
  for insert with check (true);

create policy "Allow public update chapters" on public.chapters
  for update using (true);

create policy "Allow public delete chapters" on public.chapters
  for delete using (true);

-- ============================================
-- Phase 3: Story completion status (migration-safe)
-- ============================================

alter table if exists public.stories
  add column if not exists completion_status text not null default 'ongoing';

-- ============================================
-- Phase 6: Characters
-- ============================================

-- 11. Create characters table
create table if not exists public.characters (
    id uuid default gen_random_uuid() primary key,
    story_id uuid references public.stories(id) on delete cascade not null,
    name text not null,
    age text,
    occupation text,
    personality text,
    image_url text,
    order_index integer default 0,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 12. Enable Row Level Security for characters
alter table public.characters enable row level security;

-- 13. RLS Policies for characters
create policy "Public characters are viewable by everyone." on public.characters
  for select using (true);

-- ============================================
-- Phase 16: Securing Content with User Authentication
-- ============================================

-- Add user_id to stories (if not exists, for migration)
alter table if exists public.stories
  add column if not exists user_id uuid references auth.users(id) not null default auth.uid();

-- Update RLS Policies for stories (owner only)
drop policy if exists "Allow public insert" on public.stories;
drop policy if exists "Allow public update" on public.stories;
drop policy if exists "Allow public delete" on public.stories;

create policy "Users can insert their own stories" on public.stories
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own stories" on public.stories
  for update using (auth.uid() = user_id);

create policy "Users can delete their own stories" on public.stories
  for delete using (auth.uid() = user_id);

-- Add user_id to chapters
alter table if exists public.chapters
  add column if not exists user_id uuid references auth.users(id) not null default auth.uid();

-- Update RLS Policies for chapters (owner only)
drop policy if exists "Allow public insert chapters" on public.chapters;
drop policy if exists "Allow public update chapters" on public.chapters;
drop policy if exists "Allow public delete chapters" on public.chapters;

create policy "Users can insert their own chapters" on public.chapters
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own chapters" on public.chapters
  for update using (auth.uid() = user_id);

create policy "Users can delete their own chapters" on public.chapters
  for delete using (auth.uid() = user_id);

-- Add user_id to characters
alter table if exists public.characters
  add column if not exists user_id uuid references auth.users(id) not null default auth.uid();

-- Update RLS Policies for characters (owner only)
drop policy if exists "Users can insert characters." on public.characters;
drop policy if exists "Users can update characters." on public.characters;
drop policy if exists "Users can delete characters." on public.characters;

create policy "Users can insert their own characters" on public.characters
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own characters" on public.characters
  for update using (auth.uid() = user_id);

create policy "Users can delete their own characters" on public.characters
  for delete using (auth.uid() = user_id);


-- 14. Create storage bucket for character images
insert into storage.buckets (id, name, public)
values ('characters', 'characters', true)
on conflict (id) do nothing;

-- 15. Storage policies for characters bucket
create policy "Allow public character upload" on storage.objects
  for insert with check (bucket_id = 'characters');

create policy "Allow public character read" on storage.objects
  for select using (bucket_id = 'characters');

create policy "Allow public character update" on storage.objects
  for update using (bucket_id = 'characters');

create policy "Allow public character delete" on storage.objects
  for delete using (bucket_id = 'characters');


-- ============================================
-- Phase 17: Writer Profiles
-- ============================================

-- 16. Create profiles table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade not null,
  pen_name text,
  bio text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 17. Trigger for profiles updated_at
create trigger on_profiles_updated
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- 18. Enable Row Level Security for profiles
alter table public.profiles enable row level security;

-- 19. RLS Policies for profiles
create policy "Public profiles are viewable by everyone" on public.profiles
  for select using (true);

create policy "Users can insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);

create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);

-- 20. Create storage bucket for writer avatars
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 21. Storage policies for avatars bucket
create policy "Allow public avatar upload" on storage.objects
  for insert with check (bucket_id = 'avatars');

create policy "Allow public avatar read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "Allow public avatar update" on storage.objects
  for update using (bucket_id = 'avatars');

create policy "Allow public avatar delete" on storage.objects
  for delete using (bucket_id = 'avatars');

-- ============================================
-- Phase 18: Likes
-- ============================================

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  story_id uuid references public.stories(id) on delete cascade not null,
  chapter_id uuid references public.chapters(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, story_id)
);

alter table public.likes enable row level security;

create policy "Anyone can view likes" on public.likes
  for select using (true);

create policy "Users can insert their own likes" on public.likes
  for insert with check (auth.uid() = user_id);

create policy "Users can delete their own likes" on public.likes
  for delete using (auth.uid() = user_id);

-- ============================================
-- Phase 19: Comments
-- ============================================

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  story_id uuid references public.stories(id) on delete cascade not null,
  chapter_id uuid references public.chapters(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.comments enable row level security;

create policy "Anyone can view comments" on public.comments
  for select using (true);

create policy "Users can insert their own comments" on public.comments
  for insert with check (auth.uid() = user_id);

create policy "Users can delete their own comments" on public.comments
  for delete using (auth.uid() = user_id);

-- ============================================
-- Phase 20: Favorites (เก็บเข้าชั้น)
-- ============================================

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  story_id uuid references public.stories(id) on delete cascade not null,
  chapter_id uuid references public.chapters(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, story_id)
);

alter table public.favorites enable row level security;

create policy "Anyone can view favorites" on public.favorites
  for select using (true);

create policy "Users can insert their own favorites" on public.favorites
  for insert with check (auth.uid() = user_id);

create policy "Users can delete their own favorites" on public.favorites
  for delete using (auth.uid() = user_id);

-- ============================================
-- Phase 21: Comics Storage
-- ============================================

insert into storage.buckets (id, name, public)
values ('comics', 'comics', true)
on conflict (id) do nothing;

create policy "Allow public comic upload" on storage.objects
  for insert with check (bucket_id = 'comics');

create policy "Allow public comic read" on storage.objects
  for select using (bucket_id = 'comics');

create policy "Allow public comic update" on storage.objects
  for update using (bucket_id = 'comics');

create policy "Allow public comic delete" on storage.objects
  for delete using (bucket_id = 'comics');

-- ============================================
-- Phase 22: Monetization (Coins / VIP / Premium Chapters)
-- ============================================

alter table if exists public.chapters
  add column if not exists is_premium boolean not null default false;

alter table if exists public.chapters
  add column if not exists coin_price int not null default 0;

alter table if exists public.chapters
  drop constraint if exists chapters_coin_price_check;

alter table if exists public.chapters
  add constraint chapters_coin_price_check check (coin_price >= 0);

create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  coin_balance int not null default 0 check (coin_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger on_wallets_updated
  before update on public.wallets
  for each row execute function public.handle_updated_at();

alter table public.wallets enable row level security;

create policy "Users can view their own wallet" on public.wallets
  for select using (auth.uid() = user_id);

create table if not exists public.vip_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'inactive', -- 'inactive' | 'active' | 'past_due' | 'canceled'
  plan_code text not null default 'vip_monthly',
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger on_vip_entitlements_updated
  before update on public.vip_entitlements
  for each row execute function public.handle_updated_at();

alter table public.vip_entitlements enable row level security;

create policy "Users can view their own vip entitlement" on public.vip_entitlements
  for select using (auth.uid() = user_id);

create table if not exists public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  amount int not null,
  txn_type text not null, -- 'stripe_topup' | 'chapter_unlock' | 'admin_adjust'
  description text,
  chapter_id uuid references public.chapters(id) on delete set null,
  stripe_session_id text,
  created_at timestamptz not null default now()
);

create index if not exists coin_transactions_user_created_idx
  on public.coin_transactions(user_id, created_at desc);

alter table public.coin_transactions enable row level security;

create policy "Users can view their own coin transactions" on public.coin_transactions
  for select using (auth.uid() = user_id);

create table if not exists public.chapter_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  story_id uuid references public.stories(id) on delete cascade not null,
  chapter_id uuid references public.chapters(id) on delete cascade not null,
  spent_coins int not null default 0 check (spent_coins >= 0),
  created_at timestamptz not null default now(),
  unique(user_id, chapter_id)
);

create index if not exists chapter_unlocks_user_story_idx
  on public.chapter_unlocks(user_id, story_id);

alter table public.chapter_unlocks enable row level security;

create policy "Users can view their own chapter unlocks" on public.chapter_unlocks
  for select using (auth.uid() = user_id);

create table if not exists public.stripe_events (
  event_id text primary key,
  event_type text not null,
  created_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;

create or replace function public.unlock_premium_chapter(p_chapter_id uuid)
returns table (success boolean, message text, new_balance int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_story_id uuid;
  v_coin_price int;
  v_is_premium boolean;
  v_coin_balance int;
  v_vip_active boolean;
begin
  if v_user_id is null then
    return query select false, 'AUTH_REQUIRED', 0;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text || ':' || p_chapter_id::text));

  select c.story_id, c.coin_price, c.is_premium
    into v_story_id, v_coin_price, v_is_premium
  from public.chapters c
  where c.id = p_chapter_id and c.status = 'published';

  if not found then
    return query select false, 'CHAPTER_NOT_FOUND', 0;
    return;
  end if;

  if exists (
    select 1
    from public.chapter_unlocks u
    where u.user_id = v_user_id and u.chapter_id = p_chapter_id
  ) then
    select coalesce(w.coin_balance, 0)
      into v_coin_balance
    from public.wallets w
    where w.user_id = v_user_id;

    return query select true, 'ALREADY_UNLOCKED', coalesce(v_coin_balance, 0);
    return;
  end if;

  select exists (
    select 1
    from public.vip_entitlements v
    where v.user_id = v_user_id
      and v.status = 'active'
      and (v.current_period_end is null or v.current_period_end > now())
  ) into v_vip_active;

  if v_vip_active or not v_is_premium or coalesce(v_coin_price, 0) = 0 then
    insert into public.chapter_unlocks (user_id, story_id, chapter_id, spent_coins)
    values (v_user_id, v_story_id, p_chapter_id, 0)
    on conflict (user_id, chapter_id) do nothing;

    select coalesce(w.coin_balance, 0)
      into v_coin_balance
    from public.wallets w
    where w.user_id = v_user_id;

    return query select true, case when v_vip_active then 'UNLOCKED_BY_VIP' else 'UNLOCKED_FREE' end, coalesce(v_coin_balance, 0);
    return;
  end if;

  insert into public.wallets (user_id, coin_balance)
  values (v_user_id, 0)
  on conflict (user_id) do nothing;

  select w.coin_balance
    into v_coin_balance
  from public.wallets w
  where w.user_id = v_user_id
  for update;

  if v_coin_balance < v_coin_price then
    return query select false, 'INSUFFICIENT_COINS', v_coin_balance;
    return;
  end if;

  update public.wallets
    set coin_balance = coin_balance - v_coin_price
  where user_id = v_user_id
  returning coin_balance into v_coin_balance;

  insert into public.chapter_unlocks (user_id, story_id, chapter_id, spent_coins)
  values (v_user_id, v_story_id, p_chapter_id, v_coin_price)
  on conflict (user_id, chapter_id) do nothing;

  insert into public.coin_transactions (user_id, amount, txn_type, description, chapter_id)
  values (v_user_id, -v_coin_price, 'chapter_unlock', 'Unlock premium chapter', p_chapter_id);

  return query select true, 'UNLOCKED', v_coin_balance;
end;
$$;

revoke all on function public.unlock_premium_chapter(uuid) from public;
grant execute on function public.unlock_premium_chapter(uuid) to authenticated;
