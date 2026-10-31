SELECT
  current_database() AS database_name,
  session_user AS login_role,
  current_user AS effective_role,
  inet_server_addr() AS server_address,
  inet_server_port() AS server_port,
  pg_backend_pid() AS connection_pid,
  current_schema() AS first_schema;

SHOW server_version;
SHOW server_encoding;
SHOW TimeZone;
SHOW search_path;

SELECT
  datname AS database_name,
  pg_get_userbyid(datdba) AS database_owner,
  shobj_description(oid, 'pg_database') AS environment_note
FROM pg_database
WHERE datname = current_database();
