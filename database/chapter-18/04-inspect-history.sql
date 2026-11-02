-- Run only after resolve/deploy has created the history table.
SELECT current_database(), current_user;
SELECT migration_name, checksum, started_at, finished_at,
       rolled_back_at, applied_steps_count
FROM public._prisma_migrations
ORDER BY started_at, migration_name;

-- On failure: logs may be NULL if recording the original failure also failed.
SELECT migration_name, started_at, finished_at, rolled_back_at, logs
FROM public._prisma_migrations
WHERE finished_at IS NULL AND rolled_back_at IS NULL
ORDER BY started_at;
