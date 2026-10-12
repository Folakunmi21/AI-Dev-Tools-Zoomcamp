"""OpenTelemetry setup for the Evenly API."""

import importlib.metadata
import os

from fastapi import FastAPI
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor


SERVICE_NAME = "evenly-backend"
try:
    DEFAULT_VERSION = importlib.metadata.version("evenly-backend")
except importlib.metadata.PackageNotFoundError:
    # The source checkout is not installed when tests run directly from the
    # backend directory.
    DEFAULT_VERSION = "0.1.0"


def _resource() -> Resource:
    """Build the resource shared by all spans emitted by the backend."""
    environment = os.getenv("APP_ENV", "development")
    version = os.getenv("OTEL_SERVICE_VERSION") or os.getenv("APP_VERSION", DEFAULT_VERSION)
    return Resource.create(
        {
            "service.name": os.getenv("OTEL_SERVICE_NAME", SERVICE_NAME),
            "deployment.environment.name": environment,
            # Keep the pre-1.27 semantic-convention key for backends that have
            # not migrated their dashboards yet.
            "deployment.environment": environment,
            "service.version": version,
        }
    )


def configure_telemetry(app: FastAPI) -> TracerProvider:
    """Configure tracing and instrument the FastAPI application.

    Traces are exported when an OTLP endpoint is configured. Without one, the
    SDK still creates spans but does not make network calls, which keeps local
    development and tests self-contained.
    """
    provider = TracerProvider(resource=_resource())
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT") or os.getenv(
        "OTEL_EXPORTER_OTLP_ENDPOINT"
    )
    if endpoint and os.getenv("OTEL_TRACES_EXPORTER", "otlp").lower() != "none":
        exporter = OTLPSpanExporter(endpoint=endpoint)
        provider.add_span_processor(BatchSpanProcessor(exporter))

    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app, tracer_provider=provider)
    return provider
