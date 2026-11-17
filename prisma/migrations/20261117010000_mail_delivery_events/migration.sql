BEGIN;
SET LOCAL lock_timeout='2s';
ALTER TABLE verification_outbox DROP CONSTRAINT verification_outbox_last_failure_check,
 ADD CONSTRAINT verification_outbox_last_failure_check CHECK(last_failure IN ('connect-refused','recipient-deferred','recipient-refused','unconfirmed','address-suppressed'));
CREATE TABLE verification_mail_attempts (
 id uuid PRIMARY KEY, outbox_id uuid NOT NULL, intent_id uuid NOT NULL, attempt_no smallint NOT NULL CHECK(attempt_no BETWEEN 1 AND 3), claim_id uuid NOT NULL,
 recipient text NOT NULL, purpose text NOT NULL CHECK(purpose IN ('register','reset')), provider text NOT NULL CHECK(provider IN ('local','resend')), provider_scope varchar(100) NOT NULL,
 address_epoch bigint NOT NULL CHECK(address_epoch>=0), started_at timestamptz NOT NULL DEFAULT clock_timestamp(), observed_at timestamptz,
 send_outcome text CHECK(send_outcome IN ('accepted','connect-refused','recipient-deferred','recipient-refused','unconfirmed')),
 provider_message_id varchar(200), provider_bound_at timestamptz, binding_source text CHECK(binding_source IN ('response','manual')),
 binding_actor varchar(100), binding_reason varchar(500), binding_evidence_ref varchar(200),
 UNIQUE(outbox_id,attempt_no), UNIQUE(provider,provider_scope,provider_message_id)
);
CREATE TABLE verification_mail_events (
 id uuid PRIMARY KEY, provider text NOT NULL, provider_scope varchar(100) NOT NULL, endpoint_scope varchar(100) NOT NULL,
 event_id varchar(200) NOT NULL, body_sha256 char(64) NOT NULL, event_type varchar(100) NOT NULL, provider_message_id varchar(200) NOT NULL,
 recipient text, provider_occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 message_id varchar(200), bounce_type varchar(100), bounce_subtype varchar(100),
 attempt_id uuid REFERENCES verification_mail_attempts(id) ON DELETE RESTRICT,
 match_state text NOT NULL CHECK(match_state IN ('unmatched','matched','recipient-mismatch','unsupported')),
 effect text NOT NULL DEFAULT 'none' CHECK(effect IN ('none','suppressed','historical')),
 UNIQUE(provider,provider_scope,endpoint_scope,event_id)
);
CREATE INDEX verification_mail_events_message_idx ON verification_mail_events(provider,provider_scope,provider_message_id);
CREATE TABLE verification_mail_addresses (
 recipient text PRIMARY KEY, epoch bigint NOT NULL DEFAULT 0 CHECK(epoch>=0), blocked boolean NOT NULL DEFAULT false,
 blocked_event_id uuid REFERENCES verification_mail_events(id) ON DELETE RESTRICT, updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(blocked OR blocked_event_id IS NULL)
);
CREATE TABLE verification_mail_releases (
 id uuid PRIMARY KEY, recipient text NOT NULL REFERENCES verification_mail_addresses(recipient) ON DELETE RESTRICT,
 old_epoch bigint NOT NULL, new_epoch bigint NOT NULL CHECK(new_epoch=old_epoch+1),
 previous_blocked_event_id uuid REFERENCES verification_mail_events(id) ON DELETE RESTRICT,
 actor varchar(100) NOT NULL, reason varchar(500) NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(recipient,new_epoch)
);
COMMIT;
