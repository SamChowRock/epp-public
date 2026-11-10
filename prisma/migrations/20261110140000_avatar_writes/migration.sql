BEGIN;
CREATE TABLE public.avatar_writes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  state text NOT NULL CHECK (state IN ('writing','live','retired')),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  check_after timestamptz(3) DEFAULT (CURRENT_TIMESTAMP + interval '5 minutes'),
  UNIQUE (id, user_id),
  CHECK ((state='live') = (check_after IS NULL))
);
CREATE UNIQUE INDEX avatar_writes_one_writing ON public.avatar_writes(user_id) WHERE state='writing';
CREATE INDEX avatar_writes_due ON public.avatar_writes(check_after,id) WHERE check_after IS NOT NULL;
ALTER TABLE public.users ADD COLUMN avatar_id uuid,
  ADD COLUMN avatar_visible boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD CONSTRAINT users_current_avatar_fkey
  FOREIGN KEY (avatar_id,id) REFERENCES public.avatar_writes(id,user_id)
  ON DELETE RESTRICT ON UPDATE NO ACTION;
COMMIT;
