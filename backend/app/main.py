from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .routers import auth, budgets, expenses, groups, notifications, settlements, uploads
from .store import store

app = FastAPI(title="Evenly API", version="0.1.0", description="Database-backed API for the Evenly frontend.")
for router in (auth.router, budgets.router, groups.router, expenses.router, settlements.router, notifications.router, uploads.router):
    app.include_router(router, prefix="/api")


@app.middleware("http")
async def database_request_boundary(request: Request, call_next):
    """Refresh the domain snapshot and persist successful request mutations."""
    store.load()
    response = await call_next(request)
    if response.status_code < 400:
        store.persist()
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"code": "validation", "message": "Request validation failed.", "issues": [{"field": str(e.get("loc", ["body"])[-1]), "message": e.get("msg", "Invalid value")} for e in exc.errors()]})


@app.get("/", include_in_schema=False)
def root():
    return {"name": "Evenly API", "docs": "/docs"}
