# Contract: internal endpoints (Pub/Sub push and Cloud Scheduler)

These endpoints are mounted at `/internal`, outside `/api`, and are **not** in `/openapi.json`.

**Auth** (both endpoints): `Authorization: Bearer <Google OIDC ID token>`. The token must:
- have `aud` = `INTERNAL_OIDC_AUDIENCE`;
- have `email_verified: true`;
- have `email` ∈ `INTERNAL_ALLOWED_INVOKERS`.

Anything else — a missing token, an app JWT (even an admin's), or another audience or identity — gets `401 { "error": "unauthenticated", "message": "…" }`, and nothing runs.

## `POST /internal/events[?consumer=<name>]`

The Pub/Sub push delivery. Body (Pub/Sub push format):

```json
{
  "message": {
    "data": "<base64 of the event JSON>",
    "attributes": { "type": "booking.created", "eventId": "…", "version": "1" },
    "messageId": "…",
    "publishTime": "…"
  },
  "subscription": "projects/<p>/subscriptions/booking-events-api"
}
```

The event JSON:

```json
{
  "id": "…",
  "type": "booking.created",
  "version": 1,
  "occurredAt": "2026-09-28T18:00:00.000Z",
  "bookingId": "…",
  "requestId": "…",
  "payload": {}
}
```

| Status | When | Pub/Sub effect |
|---|---|---|
| `204` | Every handler processed it, or reported it as a repeat | Acknowledged |
| `204` | Malformed envelope or event, or unknown type or version (logged `event_rejected`) | Acknowledged, never retried |
| `500` | At least one handler failed (logged `event_handlers_failed` with their names) | Retried with backoff; dead-letter after 5 attempts |
| `401` | Authentication failed | Retried; the subscription's configuration must be fixed |

`consumer` runs only the handler with that name, for a future per-consumer subscription (research §5). An unknown name answers `204` and is logged.

## `POST /internal/sweep`

Called by Cloud Scheduler every minute. No body.

`200 OK`:

```json
{
  "published": 3,
  "stillPending": 0,
  "oldestPendingSeconds": null,
  "jobs": [{ "name": "…", "outcome": "succeeded", "detail": "…" }]
}
```

`jobs` is empty in this feature. An error inside a job never turns into a non-200: it is reported in `jobs[].outcome = "failed"`. `500` only when the sweep itself cannot run, for example when the database is unreachable.
