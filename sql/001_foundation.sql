-- Étape 1, version ChatGPT uniquement. Migration initiale idempotente.
-- Le document de slide est versionné et autorise des éléments structurés et du HTML/CSS libre.
CREATE TABLE IF NOT EXISTS public.presentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Sans titre',
  description text NOT NULL DEFAULT '',
  format text NOT NULL DEFAULT '16:9' CHECK (format IN ('16:9', '4:3', 'custom')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id uuid NOT NULL REFERENCES public.presentations(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0),
  document jsonb NOT NULL DEFAULT '{"schemaVersion":1,"mode":"structured","canvas":{"width":1920,"height":1080},"elements":[],"animations":[]}'::jsonb,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (presentation_id, position)
);

CREATE INDEX IF NOT EXISTS slides_by_presentation
  ON public.slides (presentation_id, position);
