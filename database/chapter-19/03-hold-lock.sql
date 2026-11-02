-- Only in your isolated epp_dev. Stop other writers; do not use on shared/production data.
-- API must already be ready. Use DB_POOL_MAX=1, restart API, then run each group separately.
SELECT current_database(), current_user, pg_backend_pid();
BEGIN;
SET LOCAL idle_in_transaction_session_timeout = '15s';
LOCK TABLE public.captures IN ACCESS EXCLUSIVE MODE;
-- NOW send GET /captures in two Postman tabs, less than 1 second apart.
-- Observe from a third independent connection with 02-observe-connections.sql.
-- First query: statement timeout ~3s. Second: pool acquisition timeout ~2s.
-- Run this in the SAME lock-holding editor; do not blindly execute the whole file.
ROLLBACK;
-- If idle timeout disconnected this session, reconnect; that transaction was rolled back.
