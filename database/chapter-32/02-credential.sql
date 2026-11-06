-- Safe projection: do not export the complete password hash.
SELECT u.id AS user_id,
       p.user_id IS NOT NULL AS has_password,
       split_part(p.password_hash, '$', 2) AS algorithm,
       split_part(p.password_hash, '$', 4) AS parameters,
       p.created_at,
       (SELECT count(*) FROM captures c WHERE c.user_id = u.id) AS captures,
       (SELECT count(*) FROM learning_records l WHERE l.user_id = u.id) AS learning_records
FROM users u
LEFT JOIN password_credentials p ON p.user_id = u.id
WHERE u.id = '10000000-0000-4000-8000-000000000001';
