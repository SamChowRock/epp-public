-- A statement-wide instant, with no message bodies, links, or recipients.
WITH jobs AS (
  SELECT COALESCE(lease_until, available_at) AS due
  FROM public.verification_outbox WHERE status='pending'
), depth AS (
  SELECT count(*) FILTER (WHERE due <= statement_timestamp()) AS due_now,
         count(*) FILTER (WHERE due > statement_timestamp()) AS later,
         statement_timestamp() - min(due) FILTER (WHERE due <= statement_timestamp()) AS oldest_wait
  FROM jobs
)
SELECT depth.*, CASE WHEN c.paused_by IS NULL THEN 'open'
  WHEN o.status='attempting' AND o.lease_until > statement_timestamp() THEN 'busy'
  ELSE 'paused' END AS channel
FROM depth CROSS JOIN public.verification_mail_control c
LEFT JOIN public.verification_outbox o ON o.id=c.paused_by WHERE c.id=1;
