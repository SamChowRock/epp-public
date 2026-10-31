SELECT current_database(), current_user, inet_server_addr(), inet_server_port();
SHOW data_directory;
SHOW hba_file;

SELECT
  rule_number,
  line_number,
  type,
  database,
  user_name,
  address,
  auth_method,
  error
FROM pg_hba_file_rules
ORDER BY line_number;
