-- Dedicated VERIFY only. Run ONE numbered block at a time.
-- Both editors use auto-commit outside explicit transactions.
-- 1. Run in both editors; database names must match, backend PIDs must differ.
SELECT current_database(), pg_backend_pid();

-- 2. A only. A pre-existing schema is a reason to stop and inspect, not to reset.
BEGIN;
CREATE SCHEMA ch31_booking;
CREATE TABLE ch31_booking.sessions (
  id integer PRIMARY KEY,
  remaining integer NOT NULL CHECK (remaining >= 0)
);
CREATE TABLE ch31_booking.bookings (
  session_id integer REFERENCES ch31_booking.sessions NOT NULL,
  member_id integer NOT NULL,
  PRIMARY KEY (session_id, member_id)
);
INSERT INTO ch31_booking.sessions VALUES (1, 1), (2, 1), (3, 2);
COMMIT;

-- 3. A and then B. Keep both transactions open.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '180s';
SELECT remaining FROM ch31_booking.sessions WHERE id = 1;

-- 4. A: member 101; B: change 101 to 202. B waits while A holds the row.
WITH seat AS (
  UPDATE ch31_booking.sessions SET remaining = remaining - 1
  WHERE id = 1 AND remaining > 0 RETURNING id
)
INSERT INTO ch31_booking.bookings (session_id, member_id)
SELECT id, 101 FROM seat RETURNING session_id, member_id;

-- 5. A first; after B returns zero rows, B also commits.
COMMIT;

-- 6. Either editor, outside both transactions. Also useful after an interruption.
SELECT s.id AS session_id, s.remaining, count(b.member_id) AS bookings,
       min(b.member_id) AS first_member
FROM ch31_booking.sessions s LEFT JOIN ch31_booking.bookings b ON b.session_id = s.id
GROUP BY s.id ORDER BY s.id;

-- 7. Repeat 3-4 for session 2 (change id in BOTH statements).
-- A runs ROLLBACK instead of step 5. B gets one row, then commits.
-- 8. Session 3: run step 4 with id = 3 and member 101 in auto-commit.
-- Repeat exactly: duplicate membership fails (23505); step 6 still shows 1 left.
-- 9. Optional cleanup after both sessions have ended their transactions.
-- Only for the lab you created: execute the whole block together.
BEGIN;
DROP TABLE ch31_booking.bookings, ch31_booking.sessions;
DROP SCHEMA ch31_booking;
COMMIT;
