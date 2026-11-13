-- Callers may read the recipient status under a row lock without UPDATE on users.
CREATE VIEW public.notification_recipients AS
SELECT id, status FROM public.users FOR SHARE;
