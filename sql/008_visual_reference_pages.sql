-- Bibliothèque visuelle des diapositives de référence (version ChatGPT uniquement).
-- Les fichiers PPTX originaux restent dans slide_creation_references.
CREATE TABLE IF NOT EXISTS public.slide_creation_reference_pages (
  reference_id uuid NOT NULL REFERENCES public.slide_creation_references(id) ON DELETE CASCADE,
  slide_number integer NOT NULL CHECK (slide_number BETWEEN 1 AND 200),
  image_mime text NOT NULL DEFAULT 'image/png' CHECK (image_mime = 'image/png'),
  image_data bytea NOT NULL,
  width integer NOT NULL CHECK (width BETWEEN 100 AND 4096),
  height integer NOT NULL CHECK (height BETWEEN 100 AND 4096),
  visual_kind text NOT NULL DEFAULT 'mixte' CHECK
    (visual_kind IN ('photographique','documentaire','graphique','schématique','comparatif','typographique','mixte')),
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  selected boolean NOT NULL DEFAULT true,
  render_engine text NOT NULL DEFAULT 'pptx-glimpse',
  render_warning text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(reference_id, slide_number),
  CONSTRAINT reference_image_limit CHECK (octet_length(image_data) BETWEEN 100 AND 4000000)
);
CREATE INDEX IF NOT EXISTS reference_pages_selected_kind
  ON public.slide_creation_reference_pages(visual_kind, selected, reference_id);
