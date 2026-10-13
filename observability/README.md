# Evenly observability

This is a separate Docker Compose project for the OpenTelemetry Collector
Contrib and a local Grafana observability stack. It is intentionally
independent of the application stack in the repository root.

## Start the Collector

From this directory:

```powershell
docker compose up -d
```

The Collector accepts OTLP over:

- gRPC: `http://localhost:4317`
- HTTP: `http://localhost:4318`

The stack stores and displays telemetry through:

- Grafana: `http://localhost:3000` (default login: `admin` / `admin`)
- Prometheus: `http://localhost:9090`
- Loki: `http://localhost:3100`
- Tempo: `http://localhost:3200`

The Collector exports traces to Tempo, metrics to Prometheus, and logs to
Loki. It also keeps the `debug` exporter enabled so received telemetry is
visible in Collector logs.

The current backend emits HTTP traces. Metrics and logs will appear once the
application or another telemetry source sends those signals to OTLP.

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

Grafana provisions Prometheus, Loki, and Tempo as data sources automatically.
Create dashboards and panels in Grafana after the first telemetry arrives.

Stop it with:

```powershell
docker compose down
```
