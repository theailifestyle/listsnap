-- Local only: the same runtime role Open Cloud creates, so docker compose matches the real setup.
CREATE ROLE app_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD 'listsnap-local';
GRANT CONNECT ON DATABASE app TO app_runtime;
GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
