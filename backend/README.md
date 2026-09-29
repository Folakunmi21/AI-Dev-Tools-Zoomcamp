# Evenly backend

The backend uses SQLAlchemy for database access. Configure the database with
the `DATABASE_URL` environment variable. For local PostgreSQL development:

```powershell
$env:DATABASE_URL = "postgresql+psycopg://evenly:evenly@localhost:5432/evenly"
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The backend includes the PostgreSQL `psycopg` driver. Supply a PostgreSQL URL
through `DATABASE_URL` to run against PostgreSQL without changing the API
layer:

```text
postgresql+psycopg://user:password@localhost/evenly
```

For example, on PowerShell:

```powershell
$env:DATABASE_URL = "postgresql+psycopg://evenly:evenly@localhost:5432/evenly"
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The database must already exist and the configured user must have permission
to run migrations. The application expects the database to be migrated before
it starts and does not call SQLAlchemy `create_all`.

SQLite remains available as an explicit fallback with
`DATABASE_URL=sqlite:///./evenly.db`. The development seed data is inserted
only when `SEED_DEMO_DATA=true` and the configured database is empty. Production
should leave this variable unset or false. `GET /health` verifies database
connectivity.

## Migrations

Run these commands from `backend/`:

```powershell
$env:DATABASE_URL = "postgresql+psycopg://evenly:evenly@localhost:5432/evenly"
uv run alembic upgrade head       # create/update the schema
uv run alembic current             # show the applied revision
uv run alembic heads               # show the latest repository revision
```

After changing SQLAlchemy metadata, create and review a migration:

```powershell
uv run alembic revision --autogenerate -m "describe the schema change"
```

For an existing database created by the former `create_all` behavior, verify
that it matches `alembic/versions/0001_initial_schema.py`, then run
`uv run alembic stamp head` once. Fresh databases should use `upgrade head`.
