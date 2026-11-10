-- Persistent visual memory. It never modifies the live selected slide nor existing variants.
-- Source IDs are deliberately retained as snapshots even if an old deck is removed.
ALTER TABLE public.slide_variants
  ADD COLUMN IF NOT EXISTS design_context jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.slide_visual_preferences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 presentation_id uuid NOT NULL,
 slide_id uuid NOT NULL,
 variant_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('selected','disliked','saved')),
 scope text NOT NULL CHECK(scope IN ('global','presentation')),
 comment text NOT NULL DEFAULT '' CHECK(length(comment)<=1200),
 slide_kind text NOT NULL DEFAULT 'mixte' CHECK(slide_kind IN
   ('photographique','documentaire','graphique','schématique','comparatif','typographique','mixte')),
 variant_name text NOT NULL,
 references_used jsonb NOT NULL DEFAULT '[]'::jsonb,
 offered_variants jsonb NOT NULL DEFAULT '[]'::jsonb,
 design_context jsonb NOT NULL DEFAULT '{}'::jsonb,
 design_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
 document_snapshot jsonb,
 selection_count integer NOT NULL DEFAULT 1 CHECK(selection_count BETWEEN 1 AND 1000),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT slide_visual_preference_unique UNIQUE (slide_id,variant_id,kind,scope)
);
CREATE INDEX IF NOT EXISTS slide_visual_preference_context_idx
  ON public.slide_visual_preferences (kind,scope,slide_kind,updated_at DESC);
CREATE INDEX IF NOT EXISTS slide_visual_preference_scope_idx
  ON public.slide_visual_preferences (presentation_id,slide_id,updated_at DESC);
