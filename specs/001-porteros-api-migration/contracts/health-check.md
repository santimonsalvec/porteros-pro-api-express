# Contract: Health Check Endpoint

## `GET /health`

Reports the operational status of the service and its MongoDB dependency. Requires no authentication. Ported unchanged from the source system (`001-clean-architecture-foundation/contracts/health-check.md`).

### Response — service and dependency healthy

**Status**: `200 OK`

```json
{ "status": "Healthy", "checks": [ { "name": "mongodb", "status": "Healthy" } ] }
```

### Response — MongoDB dependency unreachable/degraded

**Status**: `503 Service Unavailable`

```json
{ "status": "Unhealthy", "checks": [ { "name": "mongodb", "status": "Unhealthy" } ] }
```

**Contract rules** (FR-038, FR-044, SC-008):

- The response body MUST NOT include exception messages, stack traces, connection strings, or any other internal error detail — only the dependency `name` and its `status`.
- `status` values are limited to `"Healthy"`, `"Degraded"`, `"Unhealthy"`.
- HTTP status follows standard convention: `200` for `Healthy`/`Degraded`, `503` for `Unhealthy`.
- Reflects a MongoDB outage or recovery within 5 seconds of the underlying state change — health is evaluated per-request (or via a short-lived cache), not only once at startup.
