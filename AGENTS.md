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
