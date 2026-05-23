-- Apply only when contracts.auto_renew is absent. The runtime migration in
-- server.js ignores SQLite duplicate-column errors for existing databases.
ALTER TABLE contracts ADD COLUMN auto_renew INTEGER DEFAULT 0;
