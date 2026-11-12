\set ON_ERROR_STOP on
SELECT current_database() = :'expected_db' AS right_db \gset
\if :right_db
BEGIN;
GRANT CONNECT ON DATABASE :"expected_db" TO epp_cleanup;
GRANT USAGE ON SCHEMA public TO epp_cleanup;
GRANT SELECT (id,avatar_id) ON public.users TO epp_cleanup;
GRANT SELECT (id,user_id,state,check_after), UPDATE (state,check_after)
  ON public.avatar_writes TO epp_cleanup;
COMMIT;
\else
DO $$ BEGIN RAISE EXCEPTION 'Wrong cleanup database'; END $$;
\endif
