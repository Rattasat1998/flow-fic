ALTER TABLE public.favorites DROP CONSTRAINT IF EXISTS favorites_user_id_story_id_key;
ALTER TABLE public.favorites ADD CONSTRAINT favorites_user_id_story_id_chapter_id_key UNIQUE (user_id, story_id, chapter_id);
