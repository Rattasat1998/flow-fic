ALTER TABLE public.likes
  ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES public.chapters(id) ON DELETE CASCADE;

-- Ensure only one like row per user per story (same behavior as before)
ALTER TABLE public.likes DROP CONSTRAINT IF EXISTS likes_user_id_story_id_key;
ALTER TABLE public.likes ADD CONSTRAINT likes_user_id_story_id_key UNIQUE (user_id, story_id);
