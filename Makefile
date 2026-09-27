.DEFAULT_GOAL := help

# Keep uv's cache inside the project so the commands also work when the
# default user cache directory is not writable.
UV_CACHE_DIR ?= $(CURDIR)/backend/.uv-cache

.PHONY: help run backend-install backend-run backend-test backend-integration-test frontend-install frontend-run test

help:
	@echo "Available targets:"
	@echo "  make run              Start the FastAPI backend on port 8000"
	@echo "  make backend-install  Install backend dependencies"
	@echo "  make backend-run      Start the FastAPI backend on port 8000"
	@echo "  make backend-test     Run backend tests"
	@echo "  make backend-integration-test  Run tests against docker-compose.yaml"
	@echo "  make frontend-install Install frontend dependencies"
	@echo "  make frontend-run     Start the Vite frontend"
	@echo "  make test             Run backend and frontend tests"

run: backend-run

backend-install:
	cd backend && uv --cache-dir "$(UV_CACHE_DIR)" sync

backend-run: backend-install
	cd backend && uv --cache-dir "$(UV_CACHE_DIR)" run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

backend-test: backend-install
	cd backend && uv --cache-dir "$(UV_CACHE_DIR)" run pytest

backend-integration-test: backend-install
	cd backend && uv --cache-dir "$(UV_CACHE_DIR)" run pytest tests/integration/test_compose.py

frontend-install:
	cd frontend && npm install

frontend-run: frontend-install
	cd frontend && npm run dev

test: backend-test
	cd frontend && npm test -- --run
