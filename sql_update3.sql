WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, story_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.favorites
)
DELETE FROM public.favorites f
USING ranked r
WHERE f.id = r.id
  AND r.rn > 1;

ALTER TABLE public.favorites DROP CONSTRAINT IF EXISTS favorites_user_id_story_id_chapter_id_key;
ALTER TABLE public.favorites DROP CONSTRAINT IF EXISTS favorites_user_id_story_id_key;
ALTER TABLE public.favorites ADD CONSTRAINT favorites_user_id_story_id_key UNIQUE (user_id, story_id);
