-- Substitute the ID of the FIRST revision from this run. One row per candidate;
-- count the two child tables independently so one cannot multiply the other.
SELECT n.candidate_no, n.status,
  (SELECT count(*) FROM public.learning_records l WHERE l.candidate_id = n.id) AS sources,
  (SELECT count(*) FROM public.command_receipts r WHERE r.candidate_id = n.id) AS receipts,
  (SELECT l.expression_id FROM public.learning_records l WHERE l.candidate_id = n.id) AS expression_id
FROM public.candidates n
WHERE n.revision_id = '00000000-0000-0000-0000-000000000000'::uuid
ORDER BY n.candidate_no;
