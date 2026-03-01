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
    "allowScreenCapture": true,
    "allowTextToSpeech": true,
    "allowOfflineReading": true,
    "allowComments": true,
    "allowStickerComments": true,
    "allowGuestComments": true,
    "hideHeartCount": false,
    "lockAge18": false,
    "lockAppOnly": false
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

create policy "Users can insert characters." on public.characters
  for insert with check (true);

create policy "Users can update characters." on public.characters
  for update using (true);

create policy "Users can delete characters." on public.characters
  for delete using (true);

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
