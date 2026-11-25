-- Source content locks for MCP restyling. Never store raw image bytes or source texts here.
CREATE TABLE IF NOT EXISTS public.mcp_deck_content_locks (
  presentation_id uuid PRIMARY KEY REFERENCES public.presentations(id) ON DELETE CASCADE,
  baseline jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
