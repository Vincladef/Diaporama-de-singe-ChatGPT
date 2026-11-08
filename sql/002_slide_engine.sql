-- ChatGPT environment only. Optimistic concurrency prevents silent loss of slide edits.
ALTER TABLE public.slides ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
