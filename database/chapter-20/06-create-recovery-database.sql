-- ADMIN connection, postgres database, auto-commit ON. Execute individually.
SELECT current_database(),current_user,inet_server_addr(),inet_server_port();
CREATE DATABASE epp_ch20_recovery OWNER epp_owner;
REVOKE ALL ON DATABASE epp_ch20_recovery FROM PUBLIC;
