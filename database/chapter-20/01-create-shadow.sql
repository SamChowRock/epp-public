-- ADMIN connection: postgres database on the same verified instance.
-- Auto-commit ON. Execute individually, outside a transaction.
SELECT current_database(), current_user, inet_server_addr(), inet_server_port();
CREATE DATABASE epp_shadow OWNER epp_owner;
REVOKE ALL ON DATABASE epp_shadow FROM PUBLIC;
-- Only Prisma's disposable replay workspace. Never store business data here.
