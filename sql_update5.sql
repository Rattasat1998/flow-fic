-- Keep only currently supported story settings keys.
UPDATE public.stories
SET settings = jsonb_build_object(
  'allowComments',
  CASE
    WHEN jsonb_typeof(COALESCE(settings, '{}'::jsonb)->'allowComments') = 'boolean'
      THEN (COALESCE(settings, '{}'::jsonb)->>'allowComments')::boolean
    ELSE true
  END,
  'hideHeartCount',
  CASE
    WHEN jsonb_typeof(COALESCE(settings, '{}'::jsonb)->'hideHeartCount') = 'boolean'
      THEN (COALESCE(settings, '{}'::jsonb)->>'hideHeartCount')::boolean
    ELSE false
  END
);

ALTER TABLE public.stories
ALTER COLUMN settings SET DEFAULT '{"allowComments": true, "hideHeartCount": false}'::jsonb;
