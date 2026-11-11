CREATE TABLE IF NOT EXISTS public.prompt_library_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 category text NOT NULL CHECK (category IN ('socle','styles','compositions','skills','references')),
 title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
 description text NOT NULL DEFAULT '',
 prompt text NOT NULL DEFAULT '',
 preview_url text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','rejected','disabled')),
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prompt_library_category_idx ON public.prompt_library_items(category,status,updated_at DESC);