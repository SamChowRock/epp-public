BEGIN;

CREATE TEMP TABLE side18_revision (
  revision_id integer PRIMARY KEY,
  capture_id integer NOT NULL,
  UNIQUE (capture_id, revision_id)
);
INSERT INTO pg_temp.side18_revision VALUES (11, 1), (21, 2);

CREATE TEMP TABLE side18_current (
  capture_id integer PRIMARY KEY,
  revision_id integer REFERENCES pg_temp.side18_revision (revision_id)
);
INSERT INTO pg_temp.side18_current VALUES (1, 21);

SELECT c.capture_id AS claimed_owner, r.capture_id AS actual_owner
FROM pg_temp.side18_current AS c
JOIN pg_temp.side18_revision AS r USING (revision_id);

CREATE TEMP TABLE side18_checked (
  capture_id integer PRIMARY KEY,
  revision_id integer,
  FOREIGN KEY (capture_id, revision_id)
    REFERENCES pg_temp.side18_revision (capture_id, revision_id)
);
INSERT INTO pg_temp.side18_checked VALUES (1, 11), (2, NULL);
SAVEPOINT before_wrong_owner;

-- Execute this UPDATE separately. Expected SQLSTATE: 23503.
UPDATE pg_temp.side18_checked SET revision_id = 21 WHERE capture_id = 1;

ROLLBACK TO SAVEPOINT before_wrong_owner;
SELECT capture_id, revision_id FROM pg_temp.side18_checked ORDER BY capture_id;
ROLLBACK;
