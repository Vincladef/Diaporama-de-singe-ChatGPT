-- Diaporama de singe : schéma initial (PostgreSQL / Neon)
CREATE TABLE IF NOT EXISTS presentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Sans titre',
  description text NOT NULL DEFAULT '',
  mode text NOT NULL DEFAULT 'web' CHECK (mode IN ('web','compatible')),
  width_px integer NOT NULL DEFAULT 1920,
  height_px integer NOT NULL DEFAULT 1080,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id uuid NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  title text NOT NULL DEFAULT '',
  html text NOT NULL DEFAULT '',
  css text NOT NULL DEFAULT '',
  elements jsonb NOT NULL DEFAULT '[]'::jsonb,
  animations jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (presentation_id, position)
);

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id uuid REFERENCES presentations(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'image',
  storage_key text,
  source_url text,
  source_name text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slide_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slide_id uuid NOT NULL REFERENCES slides(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  html text NOT NULL DEFAULT '',
  css text NOT NULL DEFAULT '',
  elements jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slides_presentation_position ON slides (presentation_id,position);
CREATE INDEX IF NOT EXISTS idx_assets_presentation ON assets (presentation_id);
CREATE INDEX IF NOT EXISTS idx_slide_variants_slide ON slide_variants (slide_id);
