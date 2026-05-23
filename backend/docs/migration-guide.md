# Database Connection and Migration Guide

## Current Connection Baseline

- `backend/src/db/index.js` is the shared SQLite connection module.
- `backend/db.js` remains as a compatibility shim and re-exports `backend/src/db`.
- `backend/server.js`, `backend/hardware.js`, and `backend/naver-sync.js` all import `./db`, so they now share the same connection path and `DB_PATH` behavior.
- `DB_PATH` controls the database file. If it is not set, the default is `backend/warehouse.db`.

## Target Layout

Keep application code dependent on `require('./db')` or, for new nested modules, `require('../db')`. Do not create independent `new sqlite3.Database(...)` connections in feature modules.

Recommended responsibilities:

- `src/db/index.js`: open the SQLite connection and expose shared helpers.
- `src/db/migrations.js`: discover and apply migration files.
- `migrations/*.sql`: one forward-only migration per file, named with an ordered prefix such as `001_add_auto_renew.sql`.
- `server.js`: call the migration runner during startup before registering runtime jobs.

## Migration Table

Introduce a metadata table:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT UNIQUE NOT NULL,
  checksum TEXT NOT NULL,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

The runner should:

1. Read `backend/migrations/*.sql` in lexical order.
2. Calculate a checksum for each file.
3. Skip files already present in `schema_migrations`.
4. Run each pending file inside a transaction.
5. Insert the filename and checksum after a successful transaction.
6. Fail startup on migration errors in production.

## Existing Inline DDL

`server.js` still contains legacy `CREATE TABLE IF NOT EXISTS` bootstrap DDL. Keep it until the migration runner fully owns the schema, then move each table definition into ordered migrations and leave `server.js` with only the migration call.

The current `ALTER TABLE contracts ADD COLUMN auto_renew` inline patch should be replaced by `migrations/001_add_auto_renew.sql` once the runner is active.

## Test Databases

Tests must set `DB_PATH` before requiring `server.js` or any module that imports `./db`. The smoke tests use a temporary SQLite file so local development data is not touched.
