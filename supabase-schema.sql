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
  cover_wide_url text,
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

alter table if exists public.stories
  add column if not exists cover_wide_url text;

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


-- ============================================
-- Phase 31: Monetization Policy v1 Hardening
-- ============================================

-- ============================================
-- FlowFic Monetization Policy v1 Hardening
-- - Idempotent checkout requests
-- - Ledger audit + reversible transactions
-- - Finance status / risk events / payment cases
-- - Reconciliation run tables + function
-- ============================================

-- C-18 chapter pricing consistency
update public.chapters
set coin_price = 1
where is_premium = true and coalesce(coin_price, 0) < 1;

update public.chapters
set coin_price = 0
where is_premium = false and coalesce(coin_price, 0) <> 0;

alter table public.chapters
  drop constraint if exists chapters_premium_price_consistency_check;

alter table public.chapters
  add constraint chapters_premium_price_consistency_check
  check ((is_premium = false and coin_price = 0) or (is_premium = true and coin_price >= 1));

-- Allow temporary negative balances for reversible chargeback hold accounting.
alter table public.wallets
  drop constraint if exists wallets_coin_balance_check;

alter table public.wallets
  add constraint wallets_coin_balance_check
  check (coin_balance >= -100000000 and coin_balance <= 1000000000);

-- Ledger hardening fields
alter table public.coin_transactions
  add column if not exists reference_type text,
  add column if not exists reference_id text,
  add column if not exists policy_version text not null default 'v1',
  add column if not exists reversal_of_txn_id uuid,
  add column if not exists correlation_id text,
  add column if not exists actor_user_id uuid,
  add column if not exists reason text,
  add column if not exists running_balance_after int;

create unique index if not exists coin_txn_unique_stripe_session_topup
  on public.coin_transactions(reference_id)
  where txn_type = 'stripe_topup'
    and reference_type = 'stripe_session'
    and reference_id is not null;

create unique index if not exists coin_txn_unique_reversal
  on public.coin_transactions(reversal_of_txn_id)
  where reversal_of_txn_id is not null;

create index if not exists coin_txn_reference_idx
  on public.coin_transactions(reference_type, reference_id);

create index if not exists coin_txn_policy_version_idx
  on public.coin_transactions(policy_version);

-- Idempotent checkout request storage (5-minute window handled in API)
create table if not exists public.payment_checkout_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  idempotency_key text not null,
  kind text not null,
  package_id text,
  request_fingerprint text not null,
  status text not null default 'created',
  checkout_session_id text,
  checkout_url text,
  policy_version text not null default 'v1',
  pricing_snapshot_id text not null,
  price_minor int not null default 0,
  coin_amount int not null default 0,
  request_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_checkout_requests_kind_check check (kind in ('coins', 'vip'))
);

create unique index if not exists payment_checkout_requests_user_key_idx
  on public.payment_checkout_requests(user_id, idempotency_key);

create index if not exists payment_checkout_requests_created_idx
  on public.payment_checkout_requests(created_at desc);

alter table public.payment_checkout_requests enable row level security;

drop policy if exists "Users can view their own checkout requests" on public.payment_checkout_requests;
create policy "Users can view their own checkout requests" on public.payment_checkout_requests
  for select using (auth.uid() = user_id);

drop trigger if exists on_payment_checkout_requests_updated on public.payment_checkout_requests;
create trigger on_payment_checkout_requests_updated
  before update on public.payment_checkout_requests
  for each row execute function public.handle_updated_at();

-- User-level finance enforcement state
create table if not exists public.user_finance_statuses (
  user_id uuid primary key references auth.users(id) on delete cascade,
  finance_status text not null default 'normal',
  enforcement_level int not null default 0,
  risk_score int not null default 0,
  restriction_until timestamptz,
  last_signal_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_finance_statuses_status_check
    check (finance_status in ('normal', 'restricted_finance', 'banned_finance')),
  constraint user_finance_statuses_level_check
    check (enforcement_level between 0 and 3)
);

alter table public.user_finance_statuses enable row level security;

drop policy if exists "Users can view their own finance status" on public.user_finance_statuses;
create policy "Users can view their own finance status" on public.user_finance_statuses
  for select using (auth.uid() = user_id);

drop trigger if exists on_user_finance_statuses_updated on public.user_finance_statuses;
create trigger on_user_finance_statuses_updated
  before update on public.user_finance_statuses
  for each row execute function public.handle_updated_at();

-- Risk signals (C-25)
create table if not exists public.risk_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  signal_type text not null,
  score_delta int not null default 0,
  signal_window_minutes int not null default 60,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists risk_events_user_created_idx
  on public.risk_events(user_id, created_at desc);

alter table public.risk_events enable row level security;

-- Payment operations cases (refund / chargeback / review)
create table if not exists public.payment_cases (
  id uuid primary key default gen_random_uuid(),
  case_type text not null,
  status text not null default 'open',
  user_id uuid references auth.users(id) on delete cascade not null,
  amount int not null default 0,
  currency text not null default 'THB',
  reason text not null,
  external_reference text,
  source_txn_id uuid references public.coin_transactions(id) on delete set null,
  hold_txn_id uuid references public.coin_transactions(id) on delete set null,
  resolution_txn_id uuid references public.coin_transactions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  opened_by uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_cases_type_check check (case_type in ('refund', 'chargeback', 'manual_review')),
  constraint payment_cases_status_check check (status in ('open', 'approved', 'rejected', 'resolved', 'canceled'))
);

create index if not exists payment_cases_user_status_idx
  on public.payment_cases(user_id, status, created_at desc);

alter table public.payment_cases enable row level security;

drop trigger if exists on_payment_cases_updated on public.payment_cases;
create trigger on_payment_cases_updated
  before update on public.payment_cases
  for each row execute function public.handle_updated_at();

-- Enriched stripe event store
alter table public.stripe_events
  add column if not exists event_payload jsonb,
  add column if not exists processing_status text not null default 'received',
  add column if not exists processed_at timestamptz,
  add column if not exists last_error text;

-- Daily reconciliation run logs
create table if not exists public.payment_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  window_start timestamptz not null,
  window_end timestamptz not null,
  expected_sessions int not null default 0,
  posted_sessions int not null default 0,
  missing_sessions int not null default 0,
  extra_sessions int not null default 0,
  expected_coins bigint not null default 0,
  posted_coins bigint not null default 0,
  status text not null default 'ok',
  created_at timestamptz not null default now(),
  constraint payment_reconciliation_runs_status_check check (status in ('ok', 'alert'))
);

create table if not exists public.payment_reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.payment_reconciliation_runs(id) on delete cascade not null,
  mismatch_type text not null,
  session_id text not null,
  expected_coins int,
  posted_coins int,
  created_at timestamptz not null default now(),
  constraint payment_reconciliation_items_type_check check (mismatch_type in ('missing_posting', 'extra_posting', 'amount_mismatch'))
);

create index if not exists payment_reconciliation_items_run_idx
  on public.payment_reconciliation_items(run_id, mismatch_type);

alter table public.payment_reconciliation_runs enable row level security;
alter table public.payment_reconciliation_items enable row level security;

create or replace function public.apply_coin_transaction(
  p_user_id uuid,
  p_amount int,
  p_txn_type text,
  p_description text default null,
  p_chapter_id uuid default null,
  p_stripe_session_id text default null,
  p_reference_type text default null,
  p_reference_id text default null,
  p_policy_version text default 'v1',
  p_reversal_of_txn_id uuid default null,
  p_reason text default null,
  p_actor_user_id uuid default null,
  p_correlation_id text default null,
  p_allow_negative boolean default false
)
returns table (success boolean, message text, txn_id uuid, new_balance int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_txn_id uuid;
  v_coin_balance int;
  v_next_balance int;
  v_txn_id uuid;
begin
  if p_user_id is null then
    return query select false, 'INVALID_USER', null::uuid, 0;
    return;
  end if;

  if p_amount = 0 then
    return query select false, 'ZERO_AMOUNT', null::uuid, 0;
    return;
  end if;

  if p_reference_type is not null and p_reference_id is not null then
    select ct.id
      into v_existing_txn_id
    from public.coin_transactions ct
    where ct.reference_type = p_reference_type
      and ct.reference_id = p_reference_id
      and ct.txn_type = p_txn_type
    limit 1;

    if v_existing_txn_id is not null then
      select coalesce(w.coin_balance, 0)
        into v_coin_balance
      from public.wallets w
      where w.user_id = p_user_id;

      return query select false, 'DUPLICATE_REFERENCE', v_existing_txn_id, coalesce(v_coin_balance, 0);
      return;
    end if;
  end if;

  insert into public.wallets (user_id, coin_balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select w.coin_balance
    into v_coin_balance
  from public.wallets w
  where w.user_id = p_user_id
  for update;

  v_next_balance := coalesce(v_coin_balance, 0) + p_amount;

  if (not p_allow_negative) and v_next_balance < 0 then
    return query select false, 'INSUFFICIENT_BALANCE', null::uuid, coalesce(v_coin_balance, 0);
    return;
  end if;

  update public.wallets
    set coin_balance = v_next_balance
  where user_id = p_user_id;

  insert into public.coin_transactions (
    user_id,
    amount,
    txn_type,
    description,
    chapter_id,
    stripe_session_id,
    reference_type,
    reference_id,
    policy_version,
    reversal_of_txn_id,
    correlation_id,
    actor_user_id,
    reason,
    running_balance_after
  )
  values (
    p_user_id,
    p_amount,
    p_txn_type,
    p_description,
    p_chapter_id,
    p_stripe_session_id,
    p_reference_type,
    p_reference_id,
    coalesce(p_policy_version, 'v1'),
    p_reversal_of_txn_id,
    p_correlation_id,
    p_actor_user_id,
    p_reason,
    v_next_balance
  )
  returning id into v_txn_id;

  return query select true, 'APPLIED', v_txn_id, v_next_balance;
end;
$$;

revoke all on function public.apply_coin_transaction(
  uuid,
  int,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  text,
  uuid,
  text,
  boolean
) from public;

grant execute on function public.apply_coin_transaction(
  uuid,
  int,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  text,
  uuid,
  text,
  boolean
) to authenticated, service_role;

create or replace function public.record_finance_risk_signal(
  p_user_id uuid,
  p_signal_type text,
  p_score_delta int default 10,
  p_signal_window_minutes int default 60,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  finance_status text,
  enforcement_level int,
  risk_score int,
  restriction_until timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_score int := 0;
  v_next_score int := 0;
  v_next_status text := 'normal';
  v_next_level int := 0;
  v_restriction_until timestamptz := null;
begin
  if p_user_id is null then
    return query select 'normal'::text, 0::int, 0::int, null::timestamptz;
    return;
  end if;

  insert into public.risk_events (user_id, signal_type, score_delta, signal_window_minutes, metadata)
  values (p_user_id, p_signal_type, p_score_delta, greatest(1, p_signal_window_minutes), coalesce(p_metadata, '{}'::jsonb));

  select coalesce(s.risk_score, 0)
    into v_current_score
  from public.user_finance_statuses s
  where s.user_id = p_user_id;

  v_next_score := greatest(0, v_current_score + coalesce(p_score_delta, 0));

  if v_next_score >= 200 then
    v_next_status := 'banned_finance';
    v_next_level := 3;
    v_restriction_until := null;
  elsif v_next_score >= 100 then
    v_next_status := 'restricted_finance';
    v_next_level := 2;
    v_restriction_until := now() + interval '72 hours';
  elsif v_next_score >= 50 then
    v_next_status := 'restricted_finance';
    v_next_level := 1;
    v_restriction_until := now() + interval '24 hours';
  else
    v_next_status := 'normal';
    v_next_level := 0;
    v_restriction_until := null;
  end if;

  insert into public.user_finance_statuses (
    user_id,
    finance_status,
    enforcement_level,
    risk_score,
    restriction_until,
    last_signal_at
  )
  values (
    p_user_id,
    v_next_status,
    v_next_level,
    v_next_score,
    v_restriction_until,
    now()
  )
  on conflict (user_id) do update
    set finance_status = excluded.finance_status,
        enforcement_level = excluded.enforcement_level,
        risk_score = excluded.risk_score,
        restriction_until = excluded.restriction_until,
        last_signal_at = excluded.last_signal_at,
        updated_at = now();

  return query
    select v_next_status, v_next_level, v_next_score, v_restriction_until;
end;
$$;

revoke all on function public.record_finance_risk_signal(uuid, text, int, int, jsonb) from public;
grant execute on function public.record_finance_risk_signal(uuid, text, int, int, jsonb)
  to authenticated, service_role;

create or replace function public.run_payment_reconciliation(
  p_window_start timestamptz default (date_trunc('day', now()) - interval '1 day'),
  p_window_end timestamptz default date_trunc('day', now()),
  p_mismatch_threshold int default 0
)
returns table (
  run_id uuid,
  status text,
  expected_sessions int,
  posted_sessions int,
  missing_sessions int,
  extra_sessions int,
  expected_coins bigint,
  posted_coins bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_expected_sessions int := 0;
  v_posted_sessions int := 0;
  v_missing_sessions int := 0;
  v_extra_sessions int := 0;
  v_expected_coins bigint := 0;
  v_posted_coins bigint := 0;
  v_status text := 'ok';
begin
  insert into public.payment_reconciliation_runs (window_start, window_end)
  values (p_window_start, p_window_end)
  returning id into v_run_id;

  with expected as (
    select
      se.event_payload #>> '{data,object,id}' as session_id,
      coalesce((se.event_payload #>> '{data,object,metadata,coin_amount}')::int, 0) as coins
    from public.stripe_events se
    where se.event_type = 'checkout.session.completed'
      and se.created_at >= p_window_start
      and se.created_at < p_window_end
      and coalesce(se.event_payload #>> '{data,object,mode}', '') = 'payment'
      and coalesce(se.event_payload #>> '{data,object,payment_status}', '') = 'paid'
      and coalesce(se.event_payload #>> '{data,object,metadata,kind}', '') = 'coins'
  ),
  expected_distinct as (
    select session_id, max(coins) as coins
    from expected
    where session_id is not null and session_id <> ''
    group by session_id
  ),
  posted as (
    select
      ct.reference_id as session_id,
      sum(ct.amount)::int as coins
    from public.coin_transactions ct
    where ct.txn_type = 'stripe_topup'
      and ct.reference_type = 'stripe_session'
      and ct.created_at >= p_window_start
      and ct.created_at < p_window_end
      and ct.reference_id is not null
    group by ct.reference_id
  ),
  missing as (
    select e.session_id, e.coins as expected_coins
    from expected_distinct e
    left join posted p on p.session_id = e.session_id
    where p.session_id is null
  ),
  extra as (
    select p.session_id, p.coins as posted_coins
    from posted p
    left join expected_distinct e on e.session_id = p.session_id
    where e.session_id is null
  ),
  amount_mismatch as (
    select e.session_id, e.coins as expected_coins, p.coins as posted_coins
    from expected_distinct e
    join posted p on p.session_id = e.session_id
    where coalesce(e.coins, 0) <> coalesce(p.coins, 0)
  )
  select
    (select count(*) from expected_distinct),
    (select count(*) from posted),
    (select count(*) from missing),
    (select count(*) from extra),
    (select coalesce(sum(coins), 0)::bigint from expected_distinct),
    (select coalesce(sum(coins), 0)::bigint from posted)
  into
    v_expected_sessions,
    v_posted_sessions,
    v_missing_sessions,
    v_extra_sessions,
    v_expected_coins,
    v_posted_coins;

  insert into public.payment_reconciliation_items (run_id, mismatch_type, session_id, expected_coins, posted_coins)
  select v_run_id, 'missing_posting', m.session_id, m.expected_coins, null
  from (
    select e.session_id, e.coins as expected_coins
    from (
      select session_id, max(coins) as coins
      from (
        select
          se.event_payload #>> '{data,object,id}' as session_id,
          coalesce((se.event_payload #>> '{data,object,metadata,coin_amount}')::int, 0) as coins
        from public.stripe_events se
        where se.event_type = 'checkout.session.completed'
          and se.created_at >= p_window_start
          and se.created_at < p_window_end
          and coalesce(se.event_payload #>> '{data,object,mode}', '') = 'payment'
          and coalesce(se.event_payload #>> '{data,object,payment_status}', '') = 'paid'
          and coalesce(se.event_payload #>> '{data,object,metadata,kind}', '') = 'coins'
      ) as expected_raw
      where session_id is not null and session_id <> ''
      group by session_id
    ) e
    left join (
      select reference_id as session_id
      from public.coin_transactions
      where txn_type = 'stripe_topup'
        and reference_type = 'stripe_session'
        and created_at >= p_window_start
        and created_at < p_window_end
        and reference_id is not null
      group by reference_id
    ) p on p.session_id = e.session_id
    where p.session_id is null
  ) m;

  insert into public.payment_reconciliation_items (run_id, mismatch_type, session_id, expected_coins, posted_coins)
  select v_run_id, 'extra_posting', x.session_id, null, x.posted_coins
  from (
    select p.session_id, p.coins as posted_coins
    from (
      select reference_id as session_id, sum(amount)::int as coins
      from public.coin_transactions
      where txn_type = 'stripe_topup'
        and reference_type = 'stripe_session'
        and created_at >= p_window_start
        and created_at < p_window_end
        and reference_id is not null
      group by reference_id
    ) p
    left join (
      select session_id
      from (
        select se.event_payload #>> '{data,object,id}' as session_id
        from public.stripe_events se
        where se.event_type = 'checkout.session.completed'
          and se.created_at >= p_window_start
          and se.created_at < p_window_end
          and coalesce(se.event_payload #>> '{data,object,mode}', '') = 'payment'
          and coalesce(se.event_payload #>> '{data,object,payment_status}', '') = 'paid'
          and coalesce(se.event_payload #>> '{data,object,metadata,kind}', '') = 'coins'
      ) e
      where session_id is not null and session_id <> ''
      group by session_id
    ) e on e.session_id = p.session_id
    where e.session_id is null
  ) x;

  insert into public.payment_reconciliation_items (run_id, mismatch_type, session_id, expected_coins, posted_coins)
  select v_run_id, 'amount_mismatch', a.session_id, a.expected_coins, a.posted_coins
  from (
    select e.session_id, e.coins as expected_coins, p.coins as posted_coins
    from (
      select session_id, max(coins) as coins
      from (
        select
          se.event_payload #>> '{data,object,id}' as session_id,
          coalesce((se.event_payload #>> '{data,object,metadata,coin_amount}')::int, 0) as coins
        from public.stripe_events se
        where se.event_type = 'checkout.session.completed'
          and se.created_at >= p_window_start
          and se.created_at < p_window_end
          and coalesce(se.event_payload #>> '{data,object,mode}', '') = 'payment'
          and coalesce(se.event_payload #>> '{data,object,payment_status}', '') = 'paid'
          and coalesce(se.event_payload #>> '{data,object,metadata,kind}', '') = 'coins'
      ) expected_raw
      where session_id is not null and session_id <> ''
      group by session_id
    ) e
    join (
      select reference_id as session_id, sum(amount)::int as coins
      from public.coin_transactions
      where txn_type = 'stripe_topup'
        and reference_type = 'stripe_session'
        and created_at >= p_window_start
        and created_at < p_window_end
        and reference_id is not null
      group by reference_id
    ) p on p.session_id = e.session_id
    where coalesce(e.coins, 0) <> coalesce(p.coins, 0)
  ) a;

  if (v_missing_sessions + v_extra_sessions) > greatest(0, p_mismatch_threshold) then
    v_status := 'alert';
  end if;

  update public.payment_reconciliation_runs
    set expected_sessions = v_expected_sessions,
        posted_sessions = v_posted_sessions,
        missing_sessions = v_missing_sessions,
        extra_sessions = v_extra_sessions,
        expected_coins = v_expected_coins,
        posted_coins = v_posted_coins,
        status = v_status
  where id = v_run_id;

  return query
    select v_run_id, v_status, v_expected_sessions, v_posted_sessions, v_missing_sessions, v_extra_sessions, v_expected_coins, v_posted_coins;
end;
$$;

revoke all on function public.run_payment_reconciliation(timestamptz, timestamptz, int) from public;
grant execute on function public.run_payment_reconciliation(timestamptz, timestamptz, int)
  to service_role;

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
  v_finance_status text := 'normal';
  v_restriction_until timestamptz;
begin
  if v_user_id is null then
    return query select false, 'AUTH_REQUIRED', 0;
    return;
  end if;

  select coalesce(s.finance_status, 'normal'), s.restriction_until
    into v_finance_status, v_restriction_until
  from public.user_finance_statuses s
  where s.user_id = v_user_id;

  if v_finance_status = 'banned_finance' then
    return query select false, 'FINANCE_BANNED', 0;
    return;
  end if;

  if v_finance_status = 'restricted_finance' and (v_restriction_until is null or v_restriction_until > now()) then
    return query select false, 'FINANCE_RESTRICTED', 0;
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

  insert into public.coin_transactions (
    user_id,
    amount,
    txn_type,
    description,
    chapter_id,
    reference_type,
    reference_id,
    policy_version,
    reason,
    running_balance_after
  )
  values (
    v_user_id,
    -v_coin_price,
    'chapter_unlock',
    'Unlock premium chapter',
    p_chapter_id,
    'chapter_unlock',
    p_chapter_id::text,
    'v1',
    'Unlock premium chapter',
    v_coin_balance
  );

  return query select true, 'UNLOCKED', v_coin_balance;
end;
$$;

revoke all on function public.unlock_premium_chapter(uuid) from public;
grant execute on function public.unlock_premium_chapter(uuid) to authenticated, service_role;

-- ============================================
-- Phase: Branching (Cross-chapter)
-- ============================================

create table if not exists public.chapter_choices (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  from_chapter_id uuid not null references public.chapters(id) on delete cascade,
  to_chapter_id uuid references public.chapters(id) on delete cascade,
  choice_text text not null,
  outcome_text text,
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(from_chapter_id, order_index)
);

alter table if exists public.chapter_choices
  add column if not exists outcome_text text;

alter table if exists public.chapter_choices
  drop constraint if exists chapter_choices_no_self_loop;

alter table if exists public.chapter_choices
  add constraint chapter_choices_no_self_loop
  check (to_chapter_id is null or from_chapter_id <> to_chapter_id);

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

alter table if exists public.chapter_choices enable row level security;

drop policy if exists "chapter_choices_select_story_visible" on public.chapter_choices;
drop policy if exists "chapter_choices_insert_owner_only" on public.chapter_choices;
drop policy if exists "chapter_choices_update_owner_only" on public.chapter_choices;
drop policy if exists "chapter_choices_delete_owner_only" on public.chapter_choices;

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

drop trigger if exists on_chapter_choices_consistency on public.chapter_choices;
create trigger on_chapter_choices_consistency
  before insert or update on public.chapter_choices
  for each row execute function public.ensure_chapter_choice_story_consistency();

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

-- ============================================
-- Reader progress (resume by user/story)
-- ============================================

create table if not exists public.reader_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  last_chapter_id uuid references public.chapters(id) on delete set null,
  last_chapter_index int not null default 0,
  chapter_states jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  completed_chapter_id uuid references public.chapters(id) on delete set null,
  completed_story_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reader_progress_user_story_unique unique (user_id, story_id)
);

create index if not exists reader_progress_story_idx
  on public.reader_progress(story_id);

create index if not exists reader_progress_updated_idx
  on public.reader_progress(updated_at desc);

drop trigger if exists on_reader_progress_updated on public.reader_progress;
create trigger on_reader_progress_updated
  before update on public.reader_progress
  for each row execute function public.handle_updated_at();

alter table if exists public.reader_progress enable row level security;

drop policy if exists "reader_progress_select_own" on public.reader_progress;
drop policy if exists "reader_progress_insert_own" on public.reader_progress;
drop policy if exists "reader_progress_update_own" on public.reader_progress;
drop policy if exists "reader_progress_delete_own" on public.reader_progress;

create policy "reader_progress_select_own" on public.reader_progress
  for select
  using (auth.uid() = user_id);

create policy "reader_progress_insert_own" on public.reader_progress
  for insert
  with check (auth.uid() = user_id);

create policy "reader_progress_update_own" on public.reader_progress
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "reader_progress_delete_own" on public.reader_progress
  for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.reader_progress to authenticated;
grant all on table public.reader_progress to service_role;

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
