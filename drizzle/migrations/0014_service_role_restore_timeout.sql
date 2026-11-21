-- Restoring a full backup from the dashboard goes through the API as the service role, which
-- inherits the API's default 8-second statement limit; with real data (images included) the
-- restore takes about that long, so it was being cancelled. Only the server uses this role.
ALTER ROLE service_role SET statement_timeout = '120s';
NOTIFY pgrst, 'reload config';
