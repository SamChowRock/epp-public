BEGIN;
SET LOCAL lock_timeout = '2s';
CREATE TABLE public.notification_jobs (
  id uuid PRIMARY KEY,
  action text NOT NULL DEFAULT 'notification.create' CHECK (action='notification.create'),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  kind text NOT NULL CHECK (kind IN ('registered','password-reset')),
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + interval '1 day'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','obsolete')),
  CHECK (expires_at > created_at)
);
CREATE INDEX notification_jobs_pick_idx ON public.notification_jobs(created_at,id) WHERE status='pending';
CREATE INDEX notification_jobs_owner_idx ON public.notification_jobs(user_id);
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  kind text NOT NULL CHECK (kind IN ('registered','password-reset')),
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at timestamptz(3),
  cleared_at timestamptz(3)
);
CREATE INDEX notifications_owner_page_idx ON public.notifications(user_id,created_at DESC,id DESC);
COMMIT;
