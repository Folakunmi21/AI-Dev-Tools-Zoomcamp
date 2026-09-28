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
to create tables. SQLAlchemy creates the application table automatically on
startup.

SQLite remains available as an explicit fallback with
`DATABASE_URL=sqlite:///./evenly.db`. The development seed data is inserted
only when `SEED_DEMO_DATA=true` and the configured database is empty. Production
should leave this variable unset or false. `GET /health` verifies database
connectivity. Tables are currently initialized with SQLAlchemy `create_all`;
no migration system is installed yet.
