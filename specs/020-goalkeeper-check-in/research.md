# Research: Goalkeeper Check-in with Photo

**Feature**: `020-goalkeeper-check-in` | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)

The spec leaves these to the plan:
- how the photo is sent (§1);
- the endpoint (§2) and the transaction (§3);
- where the window values live (§4) and the distance (§5);
- the scheduled reminders and the "no check-in" notice (§6);
- the notices (§7) and what each view shows (§8).

The clarifications fix three things:
1. no check-in after start + 15 min;
2. two reminders to the goalkeeper;
3. the client sees the photo and the time, but not the location.

---

## §1 The photo: upload first, then reference it

**Decision**: The app uploads the photo with the existing `POST /api/images` (002: multipart, content-sniffed, size-limited, `uploadedBy` = caller), then checks in with the returned `imageId`. The check-in accepts only an image that exists and was uploaded by the same goalkeeper, else `400 invalid_photo`.

**Rationale**:
- It reuses 002's validation and storage untouched.
- The check-in stays a small JSON request that is easy to retry: the photo is already stored, and a repeat with the same `imageId` is idempotent.

A photo uploaded but never used is an ordinary orphan image, like any other unreferenced upload (spec edge case).

**Alternatives considered**: multipart directly on the check-in endpoint. Rejected: it duplicates 002's multer and sniffing code, and a retried request would upload twice.

## §2 Endpoint

`POST /api/goalkeepers/me/bookings/{bookingId}/check-in`, next to 012's `/accept` and 018's `/withdraw`. The body:

```json
{ "imageId": "…", "location": { "latitude": 3.45, "longitude": -76.5, "accuracyMeters": 12 } }
```

- **`location`**: optional. Latitude must be in −90..90 and longitude in −180..180. `accuracyMeters` is optional and ≥ 0.
- **Answer**: `200` with the agenda item (012), which now carries `checkIn`. The same `200` for a repeat.
- **Errors**:

| Outcome | HTTP |
|---|---|
| `not_a_goalkeeper` | `404 goalkeeper_not_found` |
| `not_found` (unknown, or never theirs) | `404 booking_not_found` |
| `not_assigned` (cancelled, withdrawn, expired…) | `409 booking_not_assigned { status }` |
| `too_early` | `409 check_in_not_open { opensAt }` |
| `too_late` | `409 check_in_closed { closedAt }` |
| `invalid_photo` | `400 invalid_photo` |
| body shape | `400 validation_failed` |

Every attempt is audited (`logCheckIn`), like the acceptance and the withdrawal.

## §3 One transaction per check-in

**Decision**: `IBookingLifecycleStore.checkIn(args)` in `MongoBookingLifecycleStore`, one `withTransaction`:
1. **Read the booking.**
   - Missing, or not this goalkeeper's → `not_found`.
   - It already has `checkIn` and it's this goalkeeper's → `replayed` with it. This is checked first, so a repeat after the window closed still answers `200`.
   - Not `assigned` → `not_assigned`.
2. **Window**: `now < opensAt` → `too_early`; `now > closesAt` → `too_late`. It's inclusive at both ends, on the platform clock.
3. **Conditional update** of `{ _id, status: 'assigned', goalkeeperId, checkIn: null }`, setting `checkIn: { at, imageId, photoUrl, location, distanceMeters }`.
4. **Event**: append `goalkeeper.checked_in` (outbox, 013).

The handler relays after the commit, and 019's `notifyOnce` sends the client's "arrived" notice through a consumer (§7).

**Races**:
- **With a withdrawal (018)**: both write the booking document, so the driver retries the loser. A withdrawal first → `not_assigned`. A check-in first → the withdrawal still ends the booking. The check-in stays on record as evidence, and the withdrawal isn't refused. A goalkeeper may withdraw only strictly before the start, and a check-in before the start doesn't forbid it.
- **With the sweep's "no check-in"**: that mark is written only when `now > closesAt`, and the check-in is refused then. So both can't happen for the same booking.

## §4 Window values per country

**Decision**: The country-scope `bookingSettings` gains an optional `checkInWindow { opensMinutesBefore (1–120, default 30), closesMinutesAfter (1–60, default 15) }`, validated like 018's `goalkeeperPenalties`.

A resolver, `resolveCheckInWindow(request)`, maps the request's city → region → country and reads the settings. Anything missing falls back to the defaults, with a `check_in_window_defaulted` warning. It's used by the check-in handler and by the sweep job, which caches per city within one run.

**Why not snapshot it on the request** (like `freeCancellationMinutes`)? That would touch the quote, the confirmation and the request (007/008/010) for a value only this feature reads. The per-country value changes rarely, and resolving it where it's used is enough.

## §5 Distance to the pitch

**Decision**: A pure domain function, `distanceMeters(a, b)` (haversine, Earth radius 6 371 km), from the phone's location to the match point (`request.match.latitude/longitude`). It's rounded to whole meters, and `null` when there's no location. It's informational only (FR-003): never compared against a limit here.

## §6 The scheduled job: reminders and "no check-in"

**Decision**: A new sweep job, `CheckInWatchJob` (`check-in-watch`), registered after `contacts-reveal`. Each run it:

1. **Selects** `bookingRepository.findForCheckInWatch(now, cap)`: assigned bookings with `startsAt` in `(now − 60 min, now + 120 min]`. The bounds cover the configured maximums. A new index `status_startsAt` `{ status: 1, startsAt: 1 }` serves the query.
2. **For each booking**, it resolves the window (cached per city) and sends, in this order:
   - **Window open** (FR-011): `opensAt ≤ now ≤ closesAt` and `checkInOpenNoticeAt: null` → a notice to the goalkeeper (`notifyOnce`, key `check-in-open:{bookingId}`), then a conditional `$set: { checkInOpenNoticeAt: now }`. A booking assigned inside the window gets it on the next run (≤ 1 min, SC-006).
   - **Last call** (FR-012): `now ≥ closesAt − 10 min`, `now ≤ closesAt`, `checkIn: null` and `checkInLastCallAt: null` → a notice to the goalkeeper (key `check-in-last-call:{bookingId}`), then `$set: { checkInLastCallAt: now }`.
   - **No check-in** (FR-009, FR-010): `now > closesAt`, `now < endsAt`, `checkIn: null` and `checkInMissedAt: null`. It sends a notice to the client with the goalkeeper's contact (key `check-in-missed:{bookingId}`), then `$set: { checkInMissedAt: now }`. That mark is the fact 021 relies on.

   Notices are written before marks, and are idempotent, as in 019's sweep.

   Once the window closed, the "window open" and "last call" notices are no longer sent (FR-013). A booking whose window closed before any run just gets the "no check-in" notice.
3. **Isolation**: one booking failing is logged and doesn't stop the others.

**Why marks on the booking, and not just the inbox keys**: the marks keep the query small (only unmarked bookings need work), and `checkInMissedAt` is the durable "no check-in" fact for 021.

## §7 Notices and texts

The texts go in a new `src/domain/notifications/checkInMessages.ts` (Spanish, `where(match)` / `localWhen`):

| Type | For | Text |
|---|---|---|
| `booking.goalkeeper_arrived` | client | "Tu portero llegó al partido en Bello · 3:00 p. m." |
| `booking.check_in_missed` | client | "Tu portero Juan Pérez no ha confirmado su llegada al partido en Bello · 3:00 p. m. Escríbele: WhatsApp +57 300 …" (name fallback "Tu portero"; WhatsApp omitted when missing) |
| `booking.check_in_open` | goalkeeper | "Ya puedes confirmar tu llegada al partido en Bello · 3:00 p. m. Tómate una foto en la cancha." |
| `booking.check_in_last_call` | goalkeeper | "Te quedan 10 minutos para confirmar tu llegada al partido en Bello · 3:00 p. m." |

The client's "arrived" notice is sent by a consumer of `goalkeeper.checked_in` (`CheckInNoticeHandler`, `runOnce`, key `goalkeeper-arrived:{bookingId}`). The other three are sent by the job. The "no check-in" notice may carry the contact: at start + 15 min the contacts are always visible (019).

## §8 What each view shows

- **Client** (`toRequestResponse`): each booking gains `checkIn: { at, photoUrl } | null`. There's no location or distance (FR-006). The photo URL is the stored image's URL, so the app shows it without a second call.
- **Goalkeeper** (`toAgendaItem`): gains `checkIn: { at, photoUrl, distanceMeters } | null`. The goalkeeper sees their own distance, which helps them see a wrong pin.
- **Administrators**: the location is stored for operations. There's no admin endpoint in this feature; 021's cases will show it.
- **Access** (FR-006a): the photo is exposed only through these views, so only the request's client, the goalkeeper who took the booking and administrators ever get its URL. 002's `GET /api/images/:id` still serves only the uploader.

## §9 Domain changes

`Booking` gains, all absent means `null`:
- `checkIn: { at; imageId; photoUrl; location: { latitude; longitude; accuracyMeters | null } | null; distanceMeters: number | null } | null`;
- `checkInOpenNoticeAt`, `checkInLastCallAt` and `checkInMissedAt`, each `Date | null`.

`CheckInWindow` (domain): `{ opensAt, lastCallAt, closesAt }` built from the start and the two minute values, with `isOpen(now)`.
