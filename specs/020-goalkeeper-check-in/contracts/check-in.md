# Contract: Goalkeeper Check-in

**Feature**: `020-goalkeeper-check-in` | **Research**: [../research.md](../research.md)

## 1. Upload the photo (existing, 002)

`POST /api/images` (multipart `image`) → `201 { "id": "…", "url": "…", … }`.

## 2. Check in

`POST /api/goalkeepers/me/bookings/{bookingId}/check-in`: goalkeeper token.

```json
{ "imageId": "0192…", "location": { "latitude": 3.4516, "longitude": -76.5320, "accuracyMeters": 12 } }
```

- `imageId`: required. It must be an image uploaded by the caller.
- `location`: optional. `latitude` is −90..90, `longitude` is −180..180, and `accuracyMeters` is ≥ 0 and optional.

**200**: the agenda item (012/019), with:

```json
{ "bookingId": "…", "status": "assigned", "checkIn": { "at": "2026-09-21T19:40:00.000Z", "photoUrl": "https://…", "distanceMeters": 35 }, "…": "agenda fields" }
```

A repeat answers the same `200` with the recorded check-in, even after the window closed.

| Error | When |
|---|---|
| `400 validation_failed` | Missing `imageId`, bad coordinates |
| `400 invalid_photo` | The image doesn't exist or wasn't uploaded by the caller |
| `404 goalkeeper_not_found` | The caller has no goalkeeper profile |
| `404 booking_not_found` | Unknown booking, or never theirs |
| `409 booking_not_assigned` + `{ status }` | Cancelled, withdrawn, expired… |
| `409 check_in_not_open` + `{ opensAt }` | Before start − 30 min |
| `409 check_in_closed` + `{ closedAt }` | After start + 15 min |

## 3. Changed answers

- **Client request views** (`bookings[]`): `checkIn: { "at", "photoUrl" } | null`, with no location or distance.
- **Goalkeeper agenda item**: `checkIn: { "at", "photoUrl", "distanceMeters" } | null`.

## 4. Notices

| `type` | For | When | Opens |
|---|---|---|---|
| `booking.check_in_open` | goalkeeper | Start − 30 min, or at once when assigned inside the window | The booking (`bookingId`) |
| `booking.check_in_last_call` | goalkeeper | Start + 5 min, only without a check-in | The booking |
| `booking.goalkeeper_arrived` | client | After the check-in | The request (`requestId`) |
| `booking.check_in_missed` | client | Start + 15 min without a check-in, with the goalkeeper's name and WhatsApp | The request |
