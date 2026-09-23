# Evenly backend

The backend uses SQLAlchemy for database access. Configure the database with
the `DATABASE_URL` environment variable; the default is a SQLite database in
the backend directory:

```powershell
$env:DATABASE_URL = "sqlite:///./evenly.db"
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
$env:DATABASE_URL = "postgresql+psycopg://evenly:secret@localhost:5432/evenly"
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The database must already exist and the configured user must have permission
to create tables. SQLAlchemy creates the application table automatically on
startup.

The development seed data is inserted only when the configured database is
empty. It is not recreated when the server restarts.
