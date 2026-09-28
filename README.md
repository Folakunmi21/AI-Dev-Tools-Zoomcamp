# Evenly

Evenly is an expense-splitting application for friends, families, roommates,
trips, and other groups. It helps people record shared expenses, calculate
individual shares, and keep track of who owes whom without processing payments
inside the app.

The project currently includes a React/Vite frontend and a database-backed
FastAPI backend. The product direction and MVP requirements are documented in
[`_docs/Spec.md`](_docs/Spec.md).

## Current features

- Quick splits without requiring an account
- Saved groups with members and shared expenses
- Equal, custom-amount, percentage, and weighted-share splits
- Multiple payers for an expense
- Balance and debt tracking without automatic debt simplification
- Budgets, settlements, notifications, and activity views
- PostgreSQL through `DATABASE_URL`, with SQLite retained as an explicit local fallback
- Docker image that builds and serves the frontend from the backend

## Project structure

```text
.
├── backend/       FastAPI API, SQLAlchemy persistence, and backend tests
├── frontend/      React/Vite application and frontend tests
├── _docs/         Product specification
├── Dockerfile     Multi-stage production image
└── Makefile       Common development commands
```

## Getting started

### Backend

The backend uses [uv](https://docs.astral.sh/uv/) for dependency management.
Run backend commands from `backend/`:

```powershell
cd backend
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Set `DATABASE_URL` before starting the server. The backend includes the
`psycopg` driver:

```powershell
$env:DATABASE_URL = "postgresql+psycopg://evenly:evenly@localhost:5432/evenly"
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```powershell
$env:DATABASE_URL = "sqlite:///./evenly.db"
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The PostgreSQL database must already exist, and the configured user must be
allowed to create tables.

Copy `.env.example` to `.env` for local settings. Set `SEED_DEMO_DATA=true`
only for local development; production should leave it false. `GET /health`
checks both the application and database connection.

The API documentation is available at <http://127.0.0.1:8000/docs>.

### Frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Vite will print the local development URL. The frontend can use the backend
HTTP service or its local mock service, depending on the configured app mode.

### Docker

Build and run the combined application from the repository root:

```powershell
docker build -t evenly .
docker run --rm -p 8000:8000 evenly
```

Open <http://127.0.0.1:8000> after the container starts.

To run the app with PostgreSQL using Docker Compose:

```powershell
docker compose up --build
```

The app is available at <http://127.0.0.1:8000>. Copy `.env.example` to `.env`
before starting Compose. PostgreSQL data is persisted in the `postgres-data`
volume and receipts in `receipts-data`. Compose builds the internal
`postgresql+psycopg://...@postgres:5432/...` URL from the `POSTGRES_*` values.

The application currently creates tables with SQLAlchemy `create_all` on
startup; Alembic is not installed. This is acceptable for the initial MVP
deployment, but migrations should be added before repeated production schema
changes.

Receipts are stored in `RECEIPT_STORAGE_DIR`. The Compose volume preserves them
locally. Railway/Render production must configure a persistent volume or add a
provider-specific object-storage adapter; the application does not yet select
or integrate a cloud storage provider.

Enable automated PostgreSQL backups and confirm a restore procedure in the
selected hosting provider's database settings. Backups are intentionally not
implemented inside the application.

## Testing

Run the backend tests from `backend/`:

```powershell
uv run pytest
```

Run the frontend tests from `frontend/`:

```powershell
npm test -- --run
```

The root `Makefile` also provides `make test`, `make backend-run`, and
`make frontend-run` shortcuts in environments with `make` available.

## Status

Evenly is under active development. The repository contains the current MVP
implementation and the next product requirements are tracked in the product
specification.
