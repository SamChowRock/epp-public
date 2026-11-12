-- First SELECT emitted for the chapter 33 learning list. Subsequent relation reads run separately.
-- Use one VERIFY editor. Four rows = limit 3 plus its lookahead.
PREPARE chapter30_list(uuid, uuid, uuid, bigint, bigint) AS
SELECT "public"."learning_records"."id", "public"."learning_records"."created_at", "public"."learning_records"."expression_id", "public"."learning_records"."candidate_id" FROM "public"."learning_records"
LEFT JOIN "public"."expressions" AS "j0" ON ("j0"."id") = ("public"."learning_records"."expression_id")
LEFT JOIN "public"."candidates" AS "j1" ON ("j1"."id") = ("public"."learning_records"."candidate_id")
LEFT JOIN "public"."capture_revisions" AS "j2" ON ("j2"."id") = ("j1"."revision_id")
LEFT JOIN "public"."captures" AS "j3" ON ("j3"."id") = ("j2"."capture_id")
WHERE ("public"."learning_records"."user_id" = $1 AND ("j0"."user_id" = $2 AND ("j0"."id" IS NOT NULL)) AND ("j3"."user_id" = $3 AND ("j3"."id" IS NOT NULL) AND ("j2"."id" IS NOT NULL) AND ("j1"."id" IS NOT NULL)))
ORDER BY "public"."learning_records"."created_at" DESC, "public"."learning_records"."id" DESC
LIMIT $4 OFFSET $5;
EXPLAIN (ANALYZE, BUFFERS) EXECUTE chapter30_list(
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 4, 0);
DEALLOCATE chapter30_list;
