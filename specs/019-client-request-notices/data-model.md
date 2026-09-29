# Data Model: Client Request Notices

**Feature**: `019-client-request-notices` | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

No new collection.

## `goalkeeperRequests` (changed)

| Field | Change |
|---|---|
| `contactsRevealedAt` | New: `Date \| null`. Set by the contacts-visible sweep once it has sent the notices. Absent means `null`. |

New index `contactsReveal_due`: `{ contactsRevealedAt: 1, startsAt: 1 }`.

## Domain

- `contactsVisibleFrom(request): Date` is `request.freeCancellationUntil()`.
- `contactsVisibleAt(request, now): boolean` is `now ≥ contactsVisibleFrom(request)` (inclusive).
- `completionRound(bookings): string | null` is the id of the latest replacement booking (by `createdAt`, then id), or `null`. It's shared with 018's outcome key.
- `isRequestComplete(bookings): boolean`: no `pending_assignment`, and at least one `assigned`.

## `notifications` (new types)

| Type | For | Dedupe key | `data` |
|---|---|---|---|
| `booking.goalkeeper_assigned` | client | `goalkeeper-assigned:{bookingId}` | `type`, `requestId`, `bookingId` |
| `request.complete` | client | `request-complete:{requestId}[:{round}]` | `type`, `requestId`, `bookingId` (the completing one) |
| `request.contacts_visible` | client | `contacts-visible:{requestId}` | `type`, `requestId` |
| `booking.client_contact_visible` | goalkeeper | `client-contact-visible:{bookingId}` | `type`, `requestId`, `bookingId` |

## API shapes (changed)

- `RequestResponse` (010) gains `contactsVisibleFrom: string` (ISO). `bookings[].goalkeeper` is `null` before that moment.
- `AgendaItem` (012) gains `clientContactVisibleFrom: string`. `client` is `null` before that moment, and always for a booking the goalkeeper no longer holds.

## Ports

| Port | Change |
|---|---|
| `IGoalkeeperRequestRepository` | `findDueForContactsReveal(now, cap)` and `markContactsRevealed(requestId, now): Promise<boolean>`. |
| `toAgendaItem` | Gains `now`. |
