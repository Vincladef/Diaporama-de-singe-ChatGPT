-- Échantillons privés des rendus Chromium ; durée de conservation : 24 heures.
-- La lecture et la modification passent exclusivement par le MCP et les routes privées.
CREATE TABLE IF NOT EXISTS public.slide_visual_review_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slide_id uuid NOT NULL REFERENCES public.slides(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.slide_variants(id) ON DELETE CASCADE,
  capture_count integer NOT NULL DEFAULT 0 CHECK (capture_count BETWEEN 0 AND 3),
  correction_count integer NOT NULL DEFAULT 0 CHECK (correction_count BETWEEN 0 AND 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
CREATE TABLE IF NOT EXISTS public.slide_visual_review_captures (
  session_id uuid NOT NULL REFERENCES public.slide_visual_review_sessions(id) ON DELETE CASCADE,
  pass integer NOT NULL CHECK (pass BETWEEN 1 AND 3),
  source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^[a-f0-9]{64}$'),
  image_mime text NOT NULL DEFAULT 'image/png' CHECK (image_mime='image/png'),
  image_data bytea NOT NULL CHECK (octet_length(image_data) BETWEEN 100 AND 3500000),
  width integer NOT NULL CHECK (width BETWEEN 320 AND 2560),
  height integer NOT NULL CHECK (height BETWEEN 240 AND 2560),
  diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(session_id,pass)
);
CREATE INDEX IF NOT EXISTS slide_visual_review_expires_idx ON public.slide_visual_review_sessions(expires_at);
CREATE INDEX IF NOT EXISTS slide_visual_review_slide_idx ON public.slide_visual_review_sessions(slide_id,variant_id,created_at DESC);
