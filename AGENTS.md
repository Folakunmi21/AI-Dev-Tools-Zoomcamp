# Repository instructions

- Use `uv` for backend dependency management.
- Run backend commands from `backend/`.
- Configure the backend database with `DATABASE_URL`; omit it to use the local SQLite default.

Useful backend commands:

```powershell
uv sync
uv add <PACKAGE-NAME>
uv run python <PYTHON-FILE>
```

- Commit completed changes regularly with clear commit messages.

## Deployment

- Production deployment is manual. Use the `Promote dev to production` GitHub Actions workflow and provide the image digest currently deployed to `dev-evenly-fdcm`.
- Do not deploy production automatically from pushes to `main`.

## Observability

- The observability stack is a separate Compose project under `observability/`.
- Run observability commands from `observability/`, for example:

```powershell
docker compose up -d
docker compose logs -f otel-collector-contrib
```

- Do not add Grafana, Prometheus, Loki, or Tempo services to the application
  `docker-compose.yaml`; keep the projects independently startable.
- The backend sends OTLP traces to `OTEL_EXPORTER_OTLP_ENDPOINT`. For local
  host-based development, use `http://localhost:4318/v1/traces`.
