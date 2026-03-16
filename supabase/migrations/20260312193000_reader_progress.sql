-- FlowFic — Reader progress persistence (user/story)

create table if not exists public.reader_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  last_chapter_id uuid references public.chapters(id) on delete set null,
  last_chapter_index int not null default 0,
  chapter_states jsonb not null default '{}'::jsonb,
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

alter table public.reader_progress enable row level security;

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
