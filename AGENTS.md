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

- Production deployment is manual. Use the `Promote dev to production` GitHub Actions workflow and provide the commit SHA currently deployed to `dev-evenly-fdcm`.
- Do not deploy production automatically from pushes to `main`.
