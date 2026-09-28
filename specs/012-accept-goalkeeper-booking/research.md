# Research: Goalkeepers See Available Matches and Accept One

**Feature**: `012-accept-goalkeeper-booking` | **Date**: 2026-09-27 | **Spec**: [spec.md](./spec.md)

No open unknowns in the stack. The decisions below implement the spec's guarantees on top of 010 (request and bookings) and 011 (wallet).

---

## §1 Everything a booking needs is fixed at quote time

**Decision**: When a quote is issued, besides the price and the free-cancellation period (010), it now stores:
- `commission`: resolved with 011's `CommissionResolver` for the quote's zone (spec clarification 1). If it is missing, the quote is refused with `service_not_configured` and `missing: ['commission']`, plus a warning log (clarification 2);
- `travelBufferMinutes`: a new booking setting, `bookingSettings.travelBufferMinutes`, resolved city → country. When absent, 30 plus a warning log, the same pattern as `freeCancellationMinutes`.

At confirmation the request copies both. Each booking stores:
- `commission`;
- `travelBufferMinutes`;
- `endsAt = startsAt + duration`;
- `searchEndsAt = startsAt − travelBufferMinutes`.

**Rationale**:
- It is the same "firm offer" principle as the price. Listing and accepting never read settings, so there are fewer reads and there is no drift.
- `searchEndsAt` and `endsAt` are stored, so the availability filter is a plain indexed range, and the clash rule works on stored values.

**Alternatives considered**: Resolve the margin at listing time per city. Many cities per listing means N extra reads, and the answer could change between listing and accepting.

## §2 The clash rule, with per-booking margins

**Decision**: A pure domain policy, `schedulePolicy.clashes(a, b)`: true when `a.startsAt < b.endsAt + m` **and** `b.startsAt < a.endsAt + m`, with `m = max(a.travelBufferMinutes, b.travelBufferMinutes)`.

`firstConflict(candidate, commitments)` returns the first assigned booking that clashes, or null. `sameRequest(candidate, commitments)` handles FR-001(g) and the "same match" rule.

**Rationale**: Each booking carries its own margin (§1). Taking the larger of the two margins is symmetric (A clashes with B exactly when B clashes with A) and never under-estimates the travel time. Within one city, both margins are equal, and it reduces to the spec's formula.

## §3 Atomic acceptance and concurrency

**Decision**: `MongoBookingAcceptanceStore.accept(bookingId, goalkeeperId, now, charge)` runs one `withTransaction` (008 options) with three steps:

1. **Claim** — `findOneAndUpdate({ _id: bookingId, status: 'pending_assignment', searchEndsAt: { $gt: now }, clientId: { $ne: goalkeeperId } }, { $set: { status: 'assigned', goalkeeperId, assignedAt: now } }, { returnDocument: 'after', session })`. No document → `not_claimed`, and the handler classifies why.
2. **Commitments** — in the same session, read the goalkeeper's other bookings with `status: 'assigned'` and apply `sameRequest` / `firstConflict`. On a violation, abort the transaction by throwing a typed abort, which becomes `same_request` or `schedule_conflict { conflictingBookingId }`.
3. **Charge** — `appendMovementInSession` (011) for `commission:<bookingId>` with the booking's `commission`. `insufficient_funds` → abort.

**Why concurrent clashes are impossible** (FR-009, SC-002): step 3 always writes the goalkeeper's wallet document (the upsert plus `$inc`). Two acceptances by the same goalkeeper, even of different bookings, therefore write-conflict on the wallet. The driver retries the loser, whose snapshot then includes the winner's assignment, and step 2 refuses it. The wallet document works as a per-goalkeeper lock that the design needs anyway, so there is no extra lock collection.

**Two goalkeepers, one booking** (FR-006, SC-001): step 1's conditional update lets exactly one of them match. The other gets `not_claimed`, re-reads the booking and sees it assigned to someone else → `already_taken`.

**Replays** (FR-007): before the transaction, read the booking; if it is already assigned to this goalkeeper → `replayed`, with no transaction. The `commission:<bookingId>` cause key is a second guard against a double charge.

**Rationale**: It follows the 008 pattern (a conditional claim plus writes in one transaction, classified afterwards) and reuses the 011 wallet write as the serialization point.

## §4 Available bookings: indexed candidates, then filtered in the domain

**Decision**:
1. Load the goalkeeper's profile (enabled zones, `suspendedUntil`), wallet balance and assigned upcoming bookings. Suspended → empty result with `reason: suspended`. `offersStatus` (011, rule a) says no → empty result with `reason: insufficient_funds` and `missingAmount`.
2. Query the candidates: `{ status: 'pending_assignment', zoneId: { $in: zones }, searchEndsAt: { $gt: now }, clientId: { $ne: goalkeeperId }, commission: { $lte: balance } }`, sorted `{ startsAt: 1, _id: 1 }`, capped at 1.000 (a hard safety limit, logged when hit).
3. Filter in the domain: drop bookings of a request the goalkeeper already holds, and bookings that clash.
4. Paginate in memory (page/pageSize, totals).

**Rationale**:
- The clash filter with per-booking margins can't be expressed as an index range, but a goalkeeper's candidate set is small (SC-005 targets 500).
- In-memory pagination keeps exact totals and a stable order.
- A new index, `{ status: 1, zoneId: 1, startsAt: 1, _id: 1 }`, serves step 2.

## §5 Suspension

**Decision**: `GoalkeeperProfile` gains `suspendedUntil: Date | null`. It is read here and written by 018 (FR-011). Suspended means `suspendedUntil > now`. There is no migration: an absent field reads as `null`.

## §6 Contact sharing

**Decision**: `IUserRepository` gains `getByIds(ids)`. The shared contact shape is `{ firstName, lastName, whatsApp: '<countryCallingCode> <whatsAppNumber>' }`:
- The client's request view (list and confirmation replay) builds a `goalkeeper` contact per assigned booking, with one `getByIds` per page.
- The goalkeeper's agenda and acceptance answer build a `client` contact.
- Before assignment, no contact is returned (FR-012, FR-013).

`toRequestResponse` gains an optional `contacts` map (`goalkeeperId → contact`) and an optional `goalkeeperId` per booking.

## §7 Agenda

**Decision**: The agenda lists the goalkeeper's bookings, of any status, that have a `goalkeeperId`:
- **Order**: upcoming (`startsAt ≥ now`) soonest first, then past most recent first, reusing 009's `pageWindow`.
- **Index**: `{ goalkeeperId: 1, startsAt: 1, _id: 1 }`.
- **Per page**: one `$in` read of the requests (match details), one of the zone and city names and one of the clients (contacts).

## §8 Error mapping

| Outcome | HTTP | `error` | Extra |
|---|---|---|---|
| accepted | 201 | — | booking (agenda item shape) |
| replayed | 200 | — | same |
| already_taken | 409 | `booking_already_taken` | — |
| search_ended | 409 | `search_ended` | — |
| zone_not_enabled | 409 | `zone_not_enabled` | — |
| insufficient_funds | 409 | `insufficient_funds` | `missingAmount` |
| suspended | 403 | `goalkeeper_suspended` | `suspendedUntil` |
| schedule_conflict | 409 | `schedule_conflict` | `conflictingBookingId` |
| own_request | 409 | `own_request` | — |
| same_request | 409 | `same_request` | — |
| not_available | 404 | `booking_not_available` | — |
| not a goalkeeper | 404 | `goalkeeper_not_found` | — |

`not_available` covers four cases: unknown or malformed id, cancelled, expired, and completed.

## §9 Audit

**Decision**: a new port `IAcceptanceAuditLogger.logAcceptance({ outcome, goalkeeperId, bookingId, requestId? })`, implemented by `PinoAuditLogger`. Successes are logged at `info`, refusals at `warn`.

## §10 Release

**Decision**: Bookings created before this feature lack `commission`, `searchEndsAt`, `endsAt` and `travelBufferMinutes`, and they are development test data (as in 010). The release deletes `bookings`, `goalkeeperRequests` and `quotes` on the target DB ([quickstart.md](./quickstart.md) §2). No code reads the old shape.

## §11 Testing

**Decision**:
- `schedulePolicy` gets a full truth table (same city, different margins, touching boundaries, same request).
- Handlers are tested with fakes plus `FixedClock`, including a `FakeBookingAcceptanceStore` that applies §3's rules in memory.
- The Mongo store is tested against mocked collections plus `withTransaction`: claim filter, commitment read, charge, abort classification, `endSession`.
- The quote handler is tested for the commission, the travel margin and `missing: commission`.
- HTTP tests cover the three endpoints plus the contact fields in "Mis reservas".
- Real concurrency (SC-001, SC-002) is checked manually against the dev cluster.
