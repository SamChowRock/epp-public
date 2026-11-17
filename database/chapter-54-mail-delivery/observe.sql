-- Read only. Replace BOTH placeholders, keep exact database gate on each query.
-- IDs come from the real API request, not invented outbox rows.
SELECT id,intent_id,recipient,status,attempts,last_failure,claim_id
FROM verification_outbox
WHERE current_database()='epp_ch54_verify' AND id='REPLACE_WITH_OUTBOX_UUID'::uuid;
SELECT id,outbox_id,attempt_no,recipient,provider,provider_scope,address_epoch,
       send_outcome,provider_message_id,binding_source
FROM verification_mail_attempts
WHERE current_database()='epp_ch54_verify' AND outbox_id='REPLACE_WITH_OUTBOX_UUID'::uuid;
SELECT e.id,e.event_id,e.provider_message_id,e.event_type,e.attempt_id,
       e.match_state,e.effect,e.provider_occurred_at,e.received_at
FROM verification_mail_events e
JOIN verification_mail_attempts a ON e.attempt_id=a.id
WHERE current_database()='epp_ch54_verify' AND a.outbox_id='REPLACE_WITH_OUTBOX_UUID'::uuid;
-- Early unmatched event: use the canonical ID in the private provider-ATTEMPT.json.
SELECT id,event_id,provider_message_id,attempt_id,match_state,effect
FROM verification_mail_events
WHERE current_database()='epp_ch54_verify' AND provider_scope='local-ch54'
  AND provider_message_id='REPLACE_WITH_PROVIDER_UUID';
SELECT recipient,epoch,blocked,blocked_event_id FROM verification_mail_addresses
WHERE current_database()='epp_ch54_verify' AND recipient IN ('a54@example.test','b54@example.test');
SELECT id,recipient,old_epoch,new_epoch,previous_blocked_event_id FROM verification_mail_releases
WHERE current_database()='epp_ch54_verify' AND recipient IN ('a54@example.test','b54@example.test');
SELECT id,paused_by FROM verification_mail_control WHERE current_database()='epp_ch54_verify' AND id=1;
