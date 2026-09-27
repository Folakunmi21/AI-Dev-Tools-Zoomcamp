# Evenly end-to-end tests

These tests start `../docker-compose.yaml`, exercise Evenly through the browser, and remove the Compose project and database volume when finished.

From this directory:

```powershell
npm install
npx playwright install chromium
npm test
```

The default host ports are `18000` for the app and `15432` for PostgreSQL. Override them with `E2E_APP_PORT`, `E2E_POSTGRES_PORT`, and `E2E_BASE_URL` when needed.
