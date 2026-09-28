from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.staticfiles import StaticFiles

from .routers import auth, budgets, expenses, groups, notifications, settlements, uploads
from .store import store

app = FastAPI(title="Evenly API", version="0.1.0", description="Database-backed API for the Evenly frontend.")
for router in (auth.router, budgets.router, groups.router, expenses.router, settlements.router, notifications.router, uploads.router):
    app.include_router(router, prefix="/api")


class SPAStaticFiles(StaticFiles):
    """Serve the Vite build and fall back to index.html for client-side routes."""

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code != 404 or scope["method"] not in {"GET", "HEAD"}:
                raise
            return FileResponse(Path(self.directory) / "index.html")


@app.middleware("http")
async def database_request_boundary(request: Request, call_next):
    """Refresh the domain snapshot and persist successful request mutations."""
    store.load()
    response = await call_next(request)
    if request.url.path != "/health" and response.status_code < 400:
        store.persist()
    return response


@app.get("/health", tags=["Health"])
def health():
    try:
        store.check_connection()
    except Exception:
        return JSONResponse(status_code=503, content={"status": "unhealthy", "database": "unavailable"})
    return {"status": "ok", "database": "ok"}


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"code": "validation", "message": "Request validation failed.", "issues": [{"field": str(e.get("loc", ["body"])[-1]), "message": e.get("msg", "Invalid value")} for e in exc.errors()]})


frontend_dist = Path(__file__).resolve().parents[2] / "frontend-dist"
if frontend_dist.is_dir():
    app.mount("/", SPAStaticFiles(directory=frontend_dist, html=True), name="frontend")
else:
    @app.get("/", include_in_schema=False)
    def root():
        return {"name": "Evenly API", "docs": "/docs"}
