CREATE TABLE public.capture_integrity_cases (
  id uuid PRIMARY KEY,
  capture_id uuid NOT NULL REFERENCES public.captures(id) ON DELETE RESTRICT,
  rule text NOT NULL DEFAULT 'missing-revisions/v1' CHECK (rule = 'missing-revisions/v1'),
  state text NOT NULL DEFAULT 'observed' CHECK (state IN ('observed','quarantined','repaired')),
  first_seen_at timestamptz(3) NOT NULL DEFAULT statement_timestamp(),
  last_seen_at timestamptz(3) NOT NULL DEFAULT statement_timestamp(),
  quarantined_at timestamptz(3),
  repaired_at timestamptz(3),
  CHECK ((state = 'observed' AND quarantined_at IS NULL AND repaired_at IS NULL)
      OR (state = 'quarantined' AND quarantined_at IS NOT NULL AND repaired_at IS NULL)
      OR (state = 'repaired' AND quarantined_at IS NOT NULL AND repaired_at IS NOT NULL))
);
CREATE UNIQUE INDEX capture_integrity_open_key ON public.capture_integrity_cases(capture_id)
  WHERE state <> 'repaired';
CREATE INDEX capture_integrity_lookup_idx ON public.capture_integrity_cases(capture_id, state);
CREATE TABLE public.capture_integrity_scans (
  id uuid PRIMARY KEY,
  database_name text NOT NULL,
  upper_id uuid,
  after_id uuid,
  started_at timestamptz(3) NOT NULL DEFAULT statement_timestamp(),
  finished_at timestamptz(3),
  scanned bigint NOT NULL DEFAULT 0 CHECK (scanned >= 0),
  CHECK (after_id IS NULL OR (upper_id IS NOT NULL AND after_id <= upper_id))
);
CREATE TABLE public.capture_integrity_repairs (
  case_id uuid PRIMARY KEY REFERENCES public.capture_integrity_cases(id) ON DELETE RESTRICT,
  source_ref text NOT NULL CHECK (length(source_ref) BETWEEN 1 AND 200),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  evidence jsonb NOT NULL,
  applied_by text NOT NULL DEFAULT current_user,
  applied_at timestamptz(3) NOT NULL DEFAULT statement_timestamp()
);
