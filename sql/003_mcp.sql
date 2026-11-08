-- Diaporama de singe CHATGPT ONLY: MCP OAuth, folders, assets and graphic alternatives.
CREATE TABLE IF NOT EXISTS public.mcp_clients(
  client_id text PRIMARY KEY,
  client_name text NOT NULL,
  redirect_uris jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.mcp_auth_codes(
  code_hash text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.mcp_clients(client_id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  resource text NOT NULL,
  scopes text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS public.mcp_tokens(
  token_hash text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.mcp_clients(client_id) ON DELETE CASCADE,
  token_kind text NOT NULL CHECK (token_kind IN ('access','refresh')),
  resource text NOT NULL,
  scopes text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_expire ON public.mcp_tokens(expires_at);
CREATE TABLE IF NOT EXISTS public.folders(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  parent_id uuid REFERENCES public.folders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.presentations ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_presentations_folder ON public.presentations(folder_id);
CREATE TABLE IF NOT EXISTS public.assets(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id uuid REFERENCES public.presentations(id) ON DELETE CASCADE,
  url text NOT NULL,
  label text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT '',
  rights text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assets_deck ON public.assets(presentation_id);
CREATE TABLE IF NOT EXISTS public.slide_variants(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slide_id uuid NOT NULL REFERENCES public.slides(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  document jsonb NOT NULL,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_variants_slide ON public.slide_variants(slide_id);
