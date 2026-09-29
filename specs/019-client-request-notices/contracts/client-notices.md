# Contract: Client Request Notices and Contact Visibility

**Feature**: `019-client-request-notices` | **Research**: [../research.md](../research.md)

There are no new endpoints. There are four new notice types, and two changed answer shapes.

## 1. Contact visibility in existing answers

**Client** (`POST /api/goalkeeper-requests/bookings`, `GET /api/goalkeeper-requests/bookings`, the two `…/cancel` endpoints):

```json
{
  "requestId": "…",
  "status": "assigned",
  "contactsVisibleFrom": "2026-09-21T19:00:00.000Z",
  "bookings": [{ "bookingId": "…", "status": "assigned", "goalkeeper": null, "assignedAt": "…" }]
}
```

From `contactsVisibleFrom` on (inclusive), `goalkeeper` is `{ "firstName", "lastName", "whatsApp" }` as in 012.

**Goalkeeper** (`GET /api/goalkeepers/me/bookings`, `POST …/accept`, `POST …/withdraw`):

```json
{ "bookingId": "…", "status": "assigned", "client": null, "clientContactVisibleFrom": "2026-09-21T19:00:00.000Z", "…": "agenda fields" }
```

- From `clientContactVisibleFrom` on, `client` is the client's contact.
- It's always `null` for a booking the goalkeeper no longer holds.

## 2. Notices (push `data` and inbox `type`)

| `type` | For | When | Opens |
|---|---|---|---|
| `booking.goalkeeper_assigned` | client | A goalkeeper took a booking and others are still searching | The request (`requestId`) |
| `request.complete` | client | That acceptance left no booking searching. Replaces the previous row for that acceptance | The request |
| `request.contacts_visible` | client | At start − 60 min, with the goalkeepers assigned before then | The request |
| `booking.client_contact_visible` | goalkeeper | At start − 60 min, for a booking they held since before then | Their agenda (`bookingId`) |

- Before start − 60 min, a notice never carries the other party's name or WhatsApp.
- A booking taken in the last hour gets no `*contact_visible` notice. The client's `booking.goalkeeper_assigned` or `request.complete` notice carries the goalkeeper's contact instead, and the goalkeeper sees the client's in the acceptance answer.
- Each notice is written once to the inbox (`GET /api/notifications`) and pushed once.
