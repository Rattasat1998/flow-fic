-- FlowFic — Read page quick-win indexes
-- Goal: reduce seq scans on frequently used read-path filters/sorts.

create index if not exists idx_characters_story_order
  on public.characters(story_id, order_index);

create index if not exists idx_comments_story_created
  on public.comments(story_id, created_at);

create index if not exists idx_stories_user_created
  on public.stories(user_id, created_at desc);

create index if not exists idx_chapters_story_order
  on public.chapters(story_id, order_index);
