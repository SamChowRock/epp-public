-- Run on the intended database before and after migration; retain results privately.
SELECT current_database(), current_user;
SELECT id, created_at FROM users ORDER BY id;
SELECT id, user_id FROM captures ORDER BY id;
SELECT id, user_id, candidate_id, expression_id FROM learning_records ORDER BY id;
SELECT user_id, operation_id, candidate_id FROM command_receipts ORDER BY user_id, operation_id;
