BEGIN;
ALTER TABLE public.users
  ADD COLUMN status text NOT NULL DEFAULT 'active',
  ADD COLUMN web_enabled boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'disabled'));

-- Preserve access for existing accounts; later INSERTs keep the false default.
UPDATE public.users SET web_enabled = true;
COMMIT;
