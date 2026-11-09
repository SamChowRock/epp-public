SELECT current_database();
-- Replace the fictional address. Omit token digests and mail contents.
SELECT i.purpose, i.email, i.issued_at, i.expires_at, i.consumed_at IS NOT NULL AS consumed,
       o.id AS message_id, o.available_at, o.status
FROM public.verification_intents i
LEFT JOIN public.verification_outbox o ON o.intent_id = i.id
WHERE i.email = 'reader42@example.test'
ORDER BY i.purpose, o.available_at, o.id;
