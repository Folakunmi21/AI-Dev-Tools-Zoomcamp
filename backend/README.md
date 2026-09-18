# Evenly backend

The backend uses SQLAlchemy for database access. Configure the database with
the `DATABASE_URL` environment variable; the default is a SQLite database in
the backend directory:

```powershell
$env:DATABASE_URL = "sqlite:///./evenly.db"
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The URL is passed directly to SQLAlchemy, so a supported database driver can
be used later without changing the API layer. For example, a PostgreSQL URL
can be supplied once its driver is added to the backend dependencies:

```text
postgresql+psycopg://user:password@localhost/evenly
```

The development seed data is inserted only when the configured database is
empty. It is not recreated when the server restarts.
