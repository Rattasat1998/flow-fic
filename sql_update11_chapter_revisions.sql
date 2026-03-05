-- ============================================
-- FlowFic — Chapter Revisions (Undo / History)
-- - Store restore points for chapter draft editor
-- ============================================

create table if not exists public.chapter_revisions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision_type text not null default 'manual_save'
    check (revision_type in ('manual_save', 'publish', 'discard', 'restore')),
  title text not null,
  content jsonb not null default '{}'::jsonb,
  is_premium boolean not null default false,
  coin_price integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_chapter_revisions_chapter_created
  on public.chapter_revisions(chapter_id, created_at desc);

create index if not exists idx_chapter_revisions_user_created
  on public.chapter_revisions(user_id, created_at desc);

alter table public.chapter_revisions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chapter_revisions'
      and policyname = 'Users can view own chapter revisions'
  ) then
    create policy "Users can view own chapter revisions"
      on public.chapter_revisions
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chapter_revisions'
      and policyname = 'Users can insert own chapter revisions'
  ) then
    create policy "Users can insert own chapter revisions"
      on public.chapter_revisions
      for insert
      with check (auth.uid() = user_id);
  end if;
end;
$$;
