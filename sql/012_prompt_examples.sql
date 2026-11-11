-- Keep existing prompt cards and their edits intact.
-- Each seeded card gets two original SVG example images, only if it has no images yet.
ALTER TABLE public.prompt_library_items
  ADD COLUMN IF NOT EXISTS example_images jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.prompt_library_items
SET example_images=jsonb_build_array('/prompt-examples/suisse-01.svg','/prompt-examples/suisse-02.svg'),
    preview_url='/prompt-examples/suisse-01.svg',version=version+1,updated_at=now()
WHERE category='styles' AND title='Éditorial suisse' AND example_images='[]'::jsonb;

UPDATE public.prompt_library_items
SET example_images=jsonb_build_array('/prompt-examples/retro-01.svg','/prompt-examples/retro-02.svg'),
    preview_url='/prompt-examples/retro-01.svg',version=version+1,updated_at=now()
WHERE category='styles' AND title='Rétro éditorial' AND example_images='[]'::jsonb;

UPDATE public.prompt_library_items
SET example_images=jsonb_build_array('/prompt-examples/musee-01.svg','/prompt-examples/musee-02.svg'),
    preview_url='/prompt-examples/musee-01.svg',version=version+1,updated_at=now()
WHERE category='styles' AND title='Muséal documentaire' AND example_images='[]'::jsonb;

UPDATE public.prompt_library_items
SET example_images=jsonb_build_array('/prompt-examples/encre-01.svg','/prompt-examples/encre-02.svg'),
    preview_url='/prompt-examples/encre-01.svg',version=version+1,updated_at=now()
WHERE category='styles' AND title='Dessin scientifique à l''encre' AND example_images='[]'::jsonb;

UPDATE public.prompt_library_items
SET example_images=jsonb_build_array('/prompt-examples/causal-01.svg','/prompt-examples/causal-02.svg'),
    preview_url='/prompt-examples/causal-01.svg',version=version+1,updated_at=now()
WHERE category='compositions' AND title='Schéma causal central' AND example_images='[]'::jsonb;

UPDATE public.prompt_library_items
SET example_images=jsonb_build_array('/prompt-examples/compar-01.svg','/prompt-examples/compar-02.svg'),
    preview_url='/prompt-examples/compar-01.svg',version=version+1,updated_at=now()
WHERE category='compositions' AND title='Comparaison asymétrique' AND example_images='[]'::jsonb;

UPDATE public.prompt_library_items
SET example_images=jsonb_build_array('/prompt-examples/document-01.svg','/prompt-examples/document-02.svg'),
    preview_url='/prompt-examples/document-01.svg',version=version+1,updated_at=now()
WHERE category='compositions' AND title='Document et commentaire' AND example_images='[]'::jsonb;
