-- Transaction-level locks, local to the current database; no business table change.
-- (2501,1) is a teaching namespace/object pair, not a UUID truncation scheme.
-- A1
BEGIN;
SELECT pg_try_advisory_xact_lock(2501,1) AS acquired;
-- B1: false; no error and no failed transaction.
BEGIN;
SELECT pg_try_advisory_xact_lock(2501,1) AS acquired;
-- A2: releases automatically
ROLLBACK;
-- B2: true, then release
SELECT pg_try_advisory_xact_lock(2501,1) AS acquired;
ROLLBACK;
-- A3: shared lifecycle gate.
BEGIN;
SELECT pg_try_advisory_xact_lock_shared(2502,1) AS acquired;
-- B3: shared mode also succeeds, then release B's shared lock.
BEGIN;
SELECT pg_try_advisory_xact_lock_shared(2502,1) AS acquired;
ROLLBACK;
-- B4: exclusive mode fails while A is still in shared mode.
BEGIN;
SELECT pg_try_advisory_xact_lock(2502,1) AS acquired;
-- A4
ROLLBACK;
-- B5: true after A ends; release.
SELECT pg_try_advisory_xact_lock(2502,1) AS acquired;
ROLLBACK;
-- Advisory locks only affect cooperating callers; ordinary SQL ignores them.
