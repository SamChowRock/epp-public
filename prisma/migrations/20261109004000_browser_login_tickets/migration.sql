CREATE TABLE public.browser_login_tickets (
  scene uuid PRIMARY KEY,
  browser_digest text NOT NULL CHECK (browser_digest ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending',
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  mini_session_id uuid,
  expires_at timestamptz(3) NOT NULL,
  CHECK ((status IN ('pending', 'cancelled') AND user_id IS NULL AND mini_session_id IS NULL)
      OR (status IN ('confirmed', 'consumed') AND user_id IS NOT NULL AND mini_session_id IS NOT NULL))
);
CREATE INDEX browser_login_tickets_expiry ON public.browser_login_tickets(expires_at);
