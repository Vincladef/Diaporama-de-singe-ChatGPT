-- Modèles visuels joints aux instructions globales du projet ChatGPT.
-- Fichiers privés, accessibles uniquement via l'éditeur autorisé ou les outils MCP.
CREATE TABLE IF NOT EXISTS public.slide_creation_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 220),
  mime_type text NOT NULL CHECK (char_length(mime_type) BETWEEN 3 AND 100),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 4000000),
  file_data bytea NOT NULL,
  analysis text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creation_reference_size_matches CHECK (octet_length(file_data) = size_bytes)
);
