CREATE TABLE public.web_access_receipts (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  operation_id uuid NOT NULL,
  before_enabled boolean NOT NULL,
  requested_enabled boolean NOT NULL,
  account_status text NOT NULL CHECK (account_status IN ('active', 'disabled')),
  db_actor text NOT NULL DEFAULT session_user,
  recorded_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, operation_id)
);
