-- One independent DBeaver editor/session; no business tables are changed.
-- Run each block separately. After the intentional error, execute ROLLBACK.
BEGIN;
CREATE TEMP TABLE candidate_state_lab (
  status text NOT NULL,
  discarded_at timestamptz(3),
  CHECK ((status = 'pending' AND discarded_at IS NULL) OR
         (status = 'discarded' AND discarded_at IS NOT NULL))
) ON COMMIT DROP;
INSERT INTO candidate_state_lab VALUES ('pending', NULL);
-- Expected 23514: this row shape is invalid.
UPDATE candidate_state_lab SET status = 'discarded';
ROLLBACK;

-- A valid row shape does not prove a valid transition.
BEGIN;
CREATE TEMP TABLE candidate_state_lab (
  status text NOT NULL,
  discarded_at timestamptz(3),
  CHECK ((status = 'pending' AND discarded_at IS NULL) OR
         (status = 'discarded' AND discarded_at IS NOT NULL))
) ON COMMIT DROP;
INSERT INTO candidate_state_lab VALUES ('discarded', CURRENT_TIMESTAMP);
UPDATE candidate_state_lab SET status = 'pending', discarded_at = NULL RETURNING *;
-- This succeeds: the CHECK does not compare OLD and NEW.
ROLLBACK;
