-- VERIFY only. Select one labelled block at a time; A and B are distinct connections.
-- Identity check: run on both.
SELECT current_database(), pg_backend_pid();

-- 0. A only, once. If this schema already exists, stop and inspect.
BEGIN;
CREATE SCHEMA ch28_roster_lab;
CREATE TABLE ch28_roster_lab.duty (
  shift_no integer NOT NULL,
  member_no integer NOT NULL,
  on_duty boolean NOT NULL,
  PRIMARY KEY (shift_no, member_no)
);
INSERT INTO ch28_roster_lab.duty VALUES
  (1, 101, true), (1, 202, true), (2, 101, true), (2, 202, true);
COMMIT;

-- 1a. Both, one connection at a time. Both must finish their SELECT before either update.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT member_no, on_duty FROM ch28_roster_lab.duty
WHERE shift_no = 1 ORDER BY member_no;

-- 1b. A only.
UPDATE ch28_roster_lab.duty AS me SET on_duty = false
WHERE me.shift_no = 1 AND me.member_no = 101 AND me.on_duty
  AND EXISTS (
    SELECT 1 FROM ch28_roster_lab.duty AS other
    WHERE other.shift_no = me.shift_no
      AND other.member_no <> me.member_no AND other.on_duty
  )
RETURNING me.member_no;

-- 1c. B only.
UPDATE ch28_roster_lab.duty AS me SET on_duty = false
WHERE me.shift_no = 1 AND me.member_no = 202 AND me.on_duty
  AND EXISTS (
    SELECT 1 FROM ch28_roster_lab.duty AS other
    WHERE other.shift_no = me.shift_no
      AND other.member_no <> me.member_no AND other.on_duty
  )
RETURNING me.member_no;

-- 1d. A, then B (one commit in each editor).
COMMIT;

-- 1e. An idle editor after both commits.
SELECT shift_no, count(*) FILTER (WHERE on_duty) AS still_on_duty
FROM ch28_roster_lab.duty GROUP BY shift_no ORDER BY shift_no;

-- 2a. Both, one connection at a time, on the second shift.
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT member_no, on_duty FROM ch28_roster_lab.duty
WHERE shift_no = 2 ORDER BY member_no;

-- 2b. A only.
UPDATE ch28_roster_lab.duty AS me SET on_duty = false
WHERE me.shift_no = 2 AND me.member_no = 101 AND me.on_duty
  AND EXISTS (
    SELECT 1 FROM ch28_roster_lab.duty AS other
    WHERE other.shift_no = me.shift_no
      AND other.member_no <> me.member_no AND other.on_duty
  )
RETURNING me.member_no;

-- 2c. B only.
UPDATE ch28_roster_lab.duty AS me SET on_duty = false
WHERE me.shift_no = 2 AND me.member_no = 202 AND me.on_duty
  AND EXISTS (
    SELECT 1 FROM ch28_roster_lab.duty AS other
    WHERE other.shift_no = me.shift_no
      AND other.member_no <> me.member_no AND other.on_duty
  )
RETURNING me.member_no;

-- 2d. Complete both transactions. On a serialization error (40001), end the
-- failed transaction with ROLLBACK if still open. Never resend only the update.
COMMIT;

-- 2e. An idle editor. Determine the member still on duty.
SELECT member_no, on_duty FROM ch28_roster_lab.duty
WHERE shift_no = 2 ORDER BY member_no;

-- 3. In one idle editor start a NEW transaction for the unsuccessful member.
-- If the remaining member is 101, substitute 101 for 202 in the next UPDATE.
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT member_no, on_duty FROM ch28_roster_lab.duty
WHERE shift_no = 2 ORDER BY member_no;
UPDATE ch28_roster_lab.duty AS me SET on_duty = false
WHERE me.shift_no = 2 AND me.member_no = 202 AND me.on_duty
  AND EXISTS (
    SELECT 1 FROM ch28_roster_lab.duty AS other
    WHERE other.shift_no = me.shift_no
      AND other.member_no <> me.member_no AND other.on_duty
  )
RETURNING me.member_no;
COMMIT;

-- 4. Either idle editor; shift 1: zero, shift 2: one.
SELECT shift_no, count(*) FILTER (WHERE on_duty) AS still_on_duty
FROM ch28_roster_lab.duty GROUP BY shift_no ORDER BY shift_no;

-- 5. Optional; only after both transactions end, for this run's objects.
BEGIN;
DROP TABLE ch28_roster_lab.duty;
DROP SCHEMA ch28_roster_lab;
COMMIT;
