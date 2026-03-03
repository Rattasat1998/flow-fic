ALTER TABLE public.favorites ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES public.chapters(id) ON DELETE CASCADE;
