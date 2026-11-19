BEGIN;
SET LOCAL lock_timeout = '2s';

CREATE FUNCTION public.require_new_revision_intent() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'new revision requires chinese_intent'
    USING ERRCODE = '23514', CONSTRAINT = 'new_revision_intent_required';
END;
$$;

CREATE TRIGGER new_revision_intent_required
BEFORE INSERT ON public.capture_revisions
FOR EACH ROW WHEN (NEW.chinese_intent IS NULL)
EXECUTE FUNCTION public.require_new_revision_intent();

-- Install the rule and keep legacy writers working until the operator cuts over.
ALTER TABLE public.capture_revisions DISABLE TRIGGER new_revision_intent_required;
COMMIT;
