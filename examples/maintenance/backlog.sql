SELECT count(*) AS due_now, min(w.check_after) AS oldest_due
FROM public.avatar_writes w
WHERE w.state IN ('writing','retired') AND w.check_after<=statement_timestamp()
  AND NOT EXISTS (SELECT FROM public.users u WHERE u.id=w.user_id AND u.avatar_id=w.id);
