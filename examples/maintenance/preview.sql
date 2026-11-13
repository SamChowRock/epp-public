SELECT w.id, w.state, w.check_after, (u.avatar_id IS NOT DISTINCT FROM w.id) AS current_avatar,
       (w.state IN ('writing','retired') AND w.check_after <= clock_timestamp()
        AND u.avatar_id IS DISTINCT FROM w.id) AS due
FROM public.avatar_writes w JOIN public.users u ON u.id=w.user_id
WHERE w.id=:'attempt_id'::uuid;
