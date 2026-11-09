BEGIN;
CREATE TABLE public.verification_mail_control (
  id smallint PRIMARY KEY CHECK (id = 1),
  paused_by uuid
);
INSERT INTO public.verification_mail_control (id) VALUES (1);
COMMIT;
