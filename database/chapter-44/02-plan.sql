-- One DBeaver connection. Run all statements in order. Temporary rows only.
BEGIN;
CREATE TEMP TABLE claim_plan (LIKE public.verification_outbox INCLUDING DEFAULTS) ON COMMIT DROP;
INSERT INTO claim_plan (id,intent_id,generation,purpose,recipient,status,available_at)
SELECT gen_random_uuid(),gen_random_uuid(),lpad(n::text,64,'0'),'register','plan@example.test',
       CASE WHEN n<=20000 THEN 'accepted' ELSE 'pending' END,
       statement_timestamp()-interval '1 hour'+n*interval '1 millisecond'
FROM generate_series(1,20010) AS s(n);
ANALYZE claim_plan;
EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM claim_plan WHERE status='pending'
 AND COALESCE(lease_until,available_at)<=statement_timestamp()
 ORDER BY COALESCE(lease_until,available_at),id LIMIT 1 FOR UPDATE SKIP LOCKED;
CREATE INDEX plan_ready ON claim_plan (status,available_at,id);
EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM claim_plan WHERE status='pending'
 AND COALESCE(lease_until,available_at)<=statement_timestamp()
 ORDER BY COALESCE(lease_until,available_at),id LIMIT 1 FOR UPDATE SKIP LOCKED;
CREATE INDEX plan_pick ON claim_plan (COALESCE(lease_until,available_at),id) WHERE status='pending';
ANALYZE claim_plan;
EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM claim_plan WHERE status='pending'
 AND COALESCE(lease_until,available_at)<=statement_timestamp()
 ORDER BY COALESCE(lease_until,available_at),id LIMIT 1 FOR UPDATE SKIP LOCKED;
ROLLBACK;
