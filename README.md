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
- SQLite by default, with database configuration through `DATABASE_URL`
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

The default database is `backend/evenly.db`. To use another database, set
`DATABASE_URL` before starting the server:

```powershell
$env:DATABASE_URL = "sqlite:///./evenly.db"
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

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
