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
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```powershell
$env:DATABASE_URL = "sqlite:///./evenly.db"
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The PostgreSQL database must already exist, and the configured user must be
allowed to run migrations.

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
docker run --rm --env DATABASE_URL="<migrated-database-url>" evenly alembic upgrade head
docker run --rm -p 8000:8000 --env DATABASE_URL="<migrated-database-url>" evenly
```

Open <http://127.0.0.1:8000> after the container starts.

To run the app with PostgreSQL using Docker Compose:

```powershell
docker compose up --build
```

The app is available at <http://127.0.0.1:8000>. Copy `.env.example` to `.env`
before starting Compose. PostgreSQL data is persisted in the `postgres-data`
volume and receipts in `receipts-data`. Compose runs the one-shot `migrate`
service to apply Alembic migrations before starting the API, and builds the internal
`postgresql+psycopg://...@postgres:5432/...` URL from the `POSTGRES_*` values.

Database schema changes are managed with Alembic. The application does not
run `create_all` or alter the schema on startup. For a fresh database:

```powershell
cd backend
$env:DATABASE_URL = "postgresql+psycopg://evenly:evenly@localhost:5432/evenly"
uv run alembic upgrade head
uv run alembic current
```

After changing SQLAlchemy metadata, create and review a migration:

```powershell
uv run alembic revision --autogenerate -m "describe the schema change"
```

Apply future migrations with `uv run alembic upgrade head`. Existing databases
created by the old `create_all` startup behavior must be checked against the
initial revision and then marked with `uv run alembic stamp head`.

Receipts are stored in `RECEIPT_STORAGE_DIR`. The Compose volume preserves them
locally. The free Render service has no persistent disk, so a real deployment
must add a provider-specific object-storage adapter before relying on receipt
uploads; the application does not yet select or integrate a cloud storage
provider.

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

## Free deployment with Render and Supabase

The repository includes `render.yaml` with two independent free Render Docker
Web Services: `dev-evenly-fdcm` is the development environment and
`evenly-fdcm` is the production environment. Their public URLs are expected to
be `https://dev-evenly-fdcm.onrender.com` and
`https://evenly-fdcm.onrender.com`, respectively. Create a separate Supabase
project (or an otherwise separate PostgreSQL database) for each environment,
then add each connection string as that service's `DATABASE_URL` secret. Do
not share databases between the environments or commit either value.

For Render or an IPv4-only local network, copy the **Session pooler** string
from Supabase's Connect dialog, not the direct `db.<project-ref>.supabase.co`
string. The direct endpoint is IPv6-only on the free plan. The session pooler
uses an IPv4 endpoint and remains compatible with SQLAlchemy and Alembic.

Render's free Web Service does not support pre-deploy commands, so apply the
schema explicitly before the first deployment and after each schema migration:

```powershell
cd backend
$env:DATABASE_URL = "<supabase-postgresql-url>"
uv run alembic upgrade head
```

Then create or sync a Render Blueprint from this repository and verify both
services with `GET /health`. The Dockerfile already listens on Render's
injected `PORT`. Free Render services sleep when idle and have ephemeral local
storage; receipt files therefore need object storage before relying on this as
a production deployment.

## CI/CD

`.github/workflows/ci-cd.yml` runs backend and frontend checks in parallel,
then builds the Compose stack and runs the backend integration and Playwright
end-to-end tests. Production promotion is manual: run the
`Promote dev to production` workflow and enter the commit SHA currently
deployed to `dev-evenly-fdcm`. The workflow applies production migrations,
deploys that exact commit to Render, waits for it to become live, and verifies
`/health`.

Configure these GitHub Actions repository secrets:

- `PRODUCTION_DATABASE_URL`: the Supabase Session Pooler URL used by Alembic.
- `RENDER_API_KEY`: a Render API key with permission to deploy the service.
- `PRODUCTION_RENDER_SERVICE_ID`: the `evenly-fdcm` Render Web Service ID.
- `PRODUCTION_RENDER_SERVICE_URL`: `https://evenly-fdcm.onrender.com`.

The `dev-evenly-fdcm` service is the development deployment. Keep its Render
service ID, URL, and database separate from the production values; it is not
deployed by the production CI job.
