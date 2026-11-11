-- Notes de feedback explicites ; les choix de variantes existants restent
-- dans slide_visual_preferences et sont affichés sans duplication.
CREATE TABLE IF NOT EXISTS public.prompt_feedback_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN
    ('style','composition','typography','images','diagram','content','animation',
     'ergonomics','technical','other')),
  kind text NOT NULL CHECK (kind IN ('positive','issue','idea','observation')),
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 2400),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prompt_feedback_journal_date_idx
  ON public.prompt_feedback_journal(created_at DESC);