ALTER TABLE public.users ADD COLUMN mini_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.sessions ADD COLUMN channel text NOT NULL DEFAULT 'web';
ALTER TABLE public.sessions ADD CONSTRAINT sessions_channel_check CHECK (channel IN ('web', 'mini'));
CREATE TABLE public.wechat_identities (
  app_id text NOT NULL,
  open_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT wechat_identities_pkey PRIMARY KEY (app_id, open_id),
  CONSTRAINT wechat_identities_app_user_key UNIQUE (app_id, user_id),
  CONSTRAINT wechat_identities_app_check CHECK (app_id ~ '^wx[0-9a-f]{16}$'),
  CONSTRAINT wechat_identities_open_check CHECK (open_id ~ '^[A-Za-z0-9_-]{1,128}$')
);
