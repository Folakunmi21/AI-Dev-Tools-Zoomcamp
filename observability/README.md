# Evenly observability

This is a separate Docker Compose project for the OpenTelemetry Collector
Contrib. It is intentionally independent of the application stack in the
repository root.

## Start the Collector

From this directory:

```powershell
docker compose up -d
```

The Collector accepts OTLP over:

- gRPC: `http://localhost:4317`
- HTTP: `http://localhost:4318`

It currently writes received telemetry to the container logs through the
`debug` exporter. This provides a backend-free local setup while keeping the
Collector pipeline ready for a real exporter later.

To use a fixed Collector version, set `OTEL_COLLECTOR_VERSION`, for example:

```powershell
$env:OTEL_COLLECTOR_VERSION = "0.138.0"
docker compose up -d
```

For the backend to send traces to this Collector, set its OTLP HTTP endpoint
to `http://localhost:4318/v1/traces` when the backend runs on the host. If the
backend is placed in another container, use the host address or a shared
network explicitly; this Compose project does not join the application
project's network.

Inspect telemetry with:

```powershell
docker compose logs -f otel-collector-contrib
```

Stop it with:

```powershell
docker compose down
```
