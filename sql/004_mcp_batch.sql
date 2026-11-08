-- Atomic modifications for the ChatGPT-only MCP server.
CREATE OR REPLACE FUNCTION public.mcp_apply_slide_batch(p_deck uuid, p_changes jsonb)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE expected integer; updated integer;
BEGIN
  IF jsonb_typeof(p_changes) <> 'array' OR jsonb_array_length(p_changes) = 0
    OR jsonb_array_length(p_changes) > 40 THEN
    RAISE EXCEPTION 'invalid_batch';
  END IF;
  SELECT COUNT(*) INTO expected FROM jsonb_array_elements(p_changes);
  IF (SELECT COUNT(DISTINCT item->>'id') FROM jsonb_array_elements(p_changes) item) <> expected THEN
    RAISE EXCEPTION 'duplicate_slide_id';
  END IF;
  UPDATE public.slides s
  SET document = c.document, notes = c.notes, revision = s.revision + 1, updated_at = now()
  FROM jsonb_to_recordset(p_changes) AS c(id uuid, revision integer, document jsonb, notes text)
  WHERE s.id = c.id AND s.presentation_id = p_deck AND s.revision = c.revision;
  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated <> expected THEN RAISE EXCEPTION 'revision_conflict_or_slide_missing'; END IF;
  RETURN updated;
END $$;

CREATE OR REPLACE FUNCTION public.mcp_reorder_slides(p_deck uuid, p_ids uuid[])
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE total integer; required integer;
BEGIN
  SELECT COUNT(*) INTO total FROM public.slides WHERE presentation_id = p_deck;
  required := COALESCE(array_length(p_ids, 1), 0);
  IF total <> required OR required > 500 THEN RAISE EXCEPTION 'invalid_slide_order'; END IF;
  IF (SELECT COUNT(DISTINCT id) FROM unnest(p_ids) id) <> required THEN
    RAISE EXCEPTION 'duplicate_slide_order';
  END IF;
  IF (SELECT COUNT(*) FROM public.slides WHERE presentation_id = p_deck AND id = ANY(p_ids)) <> total THEN
    RAISE EXCEPTION 'foreign_slide_order';
  END IF;
  UPDATE public.slides SET position = position + 100000 WHERE presentation_id = p_deck;
  UPDATE public.slides s SET position = ordered.ord - 1, updated_at=now()
  FROM unnest(p_ids) WITH ORDINALITY AS ordered(id,ord)
  WHERE s.id = ordered.id AND s.presentation_id = p_deck;
  UPDATE public.presentations SET updated_at=now() WHERE id=p_deck;
  RETURN total;
END $$;
