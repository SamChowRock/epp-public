-- Administrative connection to postgres on the verified chapter 17 instance.
-- Auto-commit ON. Execute one statement at a time; CREATE DATABASE cannot run
-- inside a transaction. If the name already exists, inspect; do not drop it.
CREATE DATABASE epp_migration_check OWNER epp_owner;
REVOKE ALL ON DATABASE epp_migration_check FROM PUBLIC;
