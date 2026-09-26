# Research: Persisted Quotes and Idempotent Booking Creation

**Feature**: `008-quote-to-booking` | **Date**: 2026-09-25 | **Spec**: [spec.md](./spec.md)

Every "NEEDS CLARIFICATION" in the plan's Technical Context is resolved below. Each entry: **Decision**, **Rationale**, **Alternatives considered**.

---

## §1 — Making "delete the quote + create the booking" atomic (FR-010, FR-011)

**Decision**: One MongoDB **multi-document transaction** per confirmation, run with the driver's `ClientSession.withTransaction(...)`:

```text
withTransaction(session, { readConcern: 'snapshot', writeConcern: { w: 'majority' }, readPreference: 'primary' }):
  quote   = quotes.findOneAndDelete({ _id: quoteId, clientId, expiresAt: { $gt: now } }, { session })
  if quote is null → return 'not_claimed'           (transaction commits with no writes)
  booking = Booking.fromQuote(newId(), quote, now)
  bookings.insertOne(toDocument(booking), { session })   (unique indexes, §2)
  return 'booked'
```

The claim is the conditional `findOneAndDelete`: the filter carries every condition of FR-009 (exists, belongs to this client, strictly before expiry), so the check and the removal happen in a single server-side operation. Wrapping it and the insert in one transaction means the quote deletion and the booking insert commit together or not at all.

The deployment supports this: `MONGODB_CONNECTION_STRING` is a `mongodb+srv://…mongodb.net` Atlas cluster, and Atlas clusters are always replica sets. Multi-document transactions need a replica set or a sharded cluster, and they are not used anywhere else in this repository yet.

Concurrency: when two transactions try to delete the same quote (a double tap), MongoDB aborts the loser with a `WriteConflict`, which is labelled `TransientTransactionError`. `withTransaction` retries it on its own, and on the retry the quote is gone (`not_claimed`). The loser is then classified by §3, which finds the winner's committed booking and returns it as a replay. So FR-016's "in progress" is a real but very rare outcome (§3), not the normal result of a double tap.

**Rationale**: This is the only option that satisfies FR-011 strictly: no observable moment with a deleted quote and no booking, or a booking and a still-pending quote. It uses only the database the system already has (no Redis), and the driver's built-in retry absorbs the double-tap race.

**Alternatives considered**:
- **The user's original sketch, `findOneAndUpdate` to `CONSUMED` then a separate `insertOne`**: the claim itself is atomic, but the two writes aren't. A crash between them leaves a consumed quote with no booking, the exact case FR-011 forbids. The clarification to delete the quote instead of marking it consumed doesn't change this. It just becomes `findOneAndDelete`.
- **Booking first, then delete the quote, with no transaction** (the unique index on `quoteId` blocks duplicates): no double booking, but a crash between the two writes briefly leaves a booking beside a still-pending quote, which FR-011/SC-005 forbid. Kept as the documented **fallback** if transactions ever become unavailable (e.g. the database moves to a standalone server). The next replay, or the TTL, would clean up the leftover quote.
- **Redis lock or idempotency-key store**: ruled out by the spec ("no external cache or lock service").

---

## §2 — Independent duplicate safeguards (FR-012, FR-022)

**Decision**: Two unique indexes on the new `bookings` collection, created by `BookingRepository.ensureIndexes()` at startup like every other repository:

| Index | Keys | Enforces |
|---|---|---|
| `quoteId_unique` | `{ quoteId: 1 }` unique | At most one booking per quote (FR-012), whatever the claim step does. |
| `client_zone_start_unique` | `{ clientId: 1, zoneId: 1, startsAt: 1 }` unique | At most one booking per client, zone and start instant (FR-022). |

`zoneId` and `startsAt` are top-level fields on the booking document (§ data-model) so the compound index is a plain one. A duplicate-key error (`code 11000`) inside the transaction aborts it, so **the quote is not deleted** (FR-021). The error is not transient, so `withTransaction` rethrows it. The store catches it outside and classifies it by `err.keyPattern`:
- `quoteId` → `already_booked` (a concurrent confirmation of the same quote won; handled as a replay, §3)
- `clientId/zoneId/startsAt` → `duplicate_booking`

Concurrency: two different quotes for the same match confirmed at once both reach the insert. The second hits a write conflict on the unique index key, which is transient, so it is retried, and the retry sees the first booking committed and fails with `11000`, giving `duplicate_booking`. That is SC-008.

**Rationale**: A unique index is the database-level guarantee FR-012 asks for, "independently of the claim step". It is also the only race-free way to enforce FR-022: checking for an existing booking before inserting has a race between the check and the insert.

**Alternatives considered**: a pre-insert `findOne` for duplicates (racy; kept only as the read that fetches the existing booking's id for the error response); a composite `_id` on the booking (couples identity to business keys and breaks the repository's UUIDv7 id convention).

---

## §3 — Classifying the outcome of a confirmation (FR-015 – FR-019)

**Decision**: The command handler orchestrates, and the store does only the transactional claim:

```text
1. booking = bookings.findOne({ quoteId, clientId })         → found: 'replayed' (200), done
2. result  = store.claimAndBook(quoteId, clientId, now)      → 'booked': 'created' (201), done
                                                               'duplicate_booking': refuse (409), done
3. (result was 'not_claimed' or 'already_booked')
   booking = bookings.findOne({ quoteId, clientId })         → found: 'replayed' (200)
   quote   = quotes.findOne({ _id: quoteId, clientId })
     quote && quote.expiresAt <= now                         → 'quote_expired' (410)
     quote && quote.expiresAt >  now                         → 'confirmation_in_progress' (409, Retry-After)
     otherwise                                               → 'quote_not_found' (404)
```

- Step 1 short-circuits retries without opening a transaction. That is the common replay case, including replays long after expiry (FR-015, US2-3).
- Step 3's second booking lookup catches a winner that committed between steps 1 and 2 (FR-017).
- The `confirmation_in_progress` branch only happens if a quote is still present and unexpired but could not be claimed. Given §1's retry that's close to impossible, but FR-016 requires a defined, retryable answer rather than a wrong one.
- Every lookup filters on `clientId`. Another client's quote or booking is therefore never found, and the client gets `quote_not_found`, which is indistinguishable from a quote that never existed (FR-018a, SC-007).
- A `quoteId` that isn't a well-formed UUID is answered `404 quote_not_found` without touching the database (FR-018a). A missing or non-string `quoteId` is `400 validation_failed`.

**Rationale**: Keeps the transaction as small as possible (one delete, one insert), keeps every branching rule in the application layer where it can be unit-tested against fakes, and makes each spec outcome map to exactly one branch.

**Alternatives considered**: doing the classification reads inside the transaction (longer transactions, more write conflicts, no correctness gain because §2's indexes already protect against duplicates); returning `404` for expired quotes as well (loses the "expired" signal the app can use while the quote hasn't been removed yet; the spec keeps both reasons and lets the app treat them the same way).

---

## §4 — Automatic removal of unconfirmed quotes (FR-023)

**Decision**: A **TTL index** on the quote's expiry: `quotes.createIndex({ expiresAt: 1 }, { name: 'expiresAt_ttl', expireAfterSeconds: 0 })`, created by `QuoteRepository.ensureIndexes()` at startup. `expiresAt` MUST be stored as a BSON `Date`, because TTL ignores strings and numbers. The application never deletes expired quotes itself.

MongoDB's TTL monitor runs about every 60 seconds, so a quote can outlive its `expiresAt` by roughly a minute or more under load. That is why the claim filter always carries `expiresAt: { $gt: now }` (FR-020), and why an existing-but-expired quote is refused as `quote_expired` (§3).

**Rationale**: This is exactly what the user asked for in the clarification: no custom cleanup job, just the database's native expiry. `expireAfterSeconds: 0` means "remove at the date stored in the field", which puts the whole validity rule (3 minutes) in the application, and the index needs no change if the validity ever changes.

**Alternatives considered**: `expireAfterSeconds: 180` on an `issuedAt` field (duplicates the validity constant in the index definition, and changing it would need a `collMod`); a scheduled cleanup job (explicitly rejected by the user).

---

## §5 — Where quote persistence lives (FR-001 – FR-006)

**Decision**: A new **command**, `IssueServiceQuoteCommand` / `IssueServiceQuoteCommandHandler`, replaces the direct use of `GetServiceQuoteQuery` in `POST /quote`:

1. `issuedAt = clock.now()`.
2. `sender.send(new GetServiceQuoteQuery(input))`, which prices the quote with the existing, unchanged rules. This follows the handler-dispatches-through-mediator precedent of `SaveDocumentPhotoCommandHandler` (feature 003).
3. Refusal → returned as is. Nothing is written (FR-004).
4. Success → `Quote.issue(idGenerator.newId(), clientId, input, pricing, area, issuedAt)`, with `expiresAt = issuedAt + QUOTE_VALIDITY_MINUTES`, then `quoteRepository.add(quote)`. If that write throws, the error propagates to the global error handler as `500 internal_error`, and neither a price nor an id is returned (FR-005).
5. Returns the existing breakdown plus `quoteId` and `expiresAt`.

`GetServiceQuoteQuery` stays a read-only query (007's FR-020 still holds for it). Its success result gains one internal sibling field, `area: { zoneId, cityId }`, so the command can record the match's zone and city. The controller still serializes only `result.quote`, so the 007 response fields don't change (FR-003).

**Rationale**: The endpoint now writes, so by the repository's CQRS convention it belongs to a command. Reusing the query through the mediator means no pricing logic moves, and the 007 handler and its tests stay untouched apart from the `area` addition.

**Alternatives considered**: writing inside `GetServiceQuoteQueryHandler` (a query with side effects breaks the convention and 007's FR-020); two mediator calls from the controller (puts orchestration in the controller); a shared `evaluateServiceQuote` function extracted from the query (more churn for the same result).

---

## §6 — Quote validity constant

**Decision**: `QUOTE_VALIDITY_MINUTES = 3` in `goalkeeperRequests/common/bookingLimits.ts`, next to the other code-level booking constants (slot step, goalkeeper counts, durations). It's a service-wide constant, not a stored setting, per the spec's Assumptions.

**Rationale**: One source of truth, readable in tests, and it follows the precedent 007 set for code constants.

**Alternatives considered**: a `bookingSettings` field per country or city (the spec explicitly assumes one fixed value); an environment variable (config sprawl for a business rule that shouldn't differ between environments).

---

## §7 — HTTP shape of the confirmation (FR-007, FR-015 – FR-018)

**Decision**: `POST /api/goalkeeper-requests/bookings` with body `{ "quoteId": "<uuid>" }`, behind the same `requireAuth + requireClientOnly + requireCompleteProfile` chain as `/quote` (FR-008). The same body is returned for a new booking (`201 Created`) and for a replay (`200 OK`). The status code is how the client tells "just created" from "already existed" (FR-015), and the booking id is the same in both (FR-017).

| Outcome | Status | `error` |
|---|---|---|
| created | 201 | — |
| replayed | 200 | — |
| missing/non-string `quoteId` | 400 | `validation_failed` |
| unknown / malformed / other client's quote | 404 | `quote_not_found` |
| expired, not yet removed | 410 | `quote_expired` |
| same client, zone and start already booked | 409 | `duplicate_booking` (+ `bookingId` of the existing booking) |
| concurrent confirmation not yet committed | 409 | `confirmation_in_progress` (+ `Retry-After: 1`) |

**Rationale**: `201`/`200` is the conventional idempotent-create signal. `410 Gone` expresses "existed, no longer valid" precisely. The two `409`s are told apart by `error`, following the existing `ApiError` convention that clients switch on `error`. Including the existing `bookingId` in `duplicate_booking` lets the app take the client to their booking once read endpoints exist, and it reveals nothing, because the booking belongs to the caller.

**Alternatives considered**: a client-generated `Idempotency-Key` header (unnecessary, since the `quoteId` already is a server-issued, single-use idempotency key); `POST /api/goalkeeper-requests` as the create endpoint (more RESTful, but ambiguous next to `/quote` and `/config`); `422` for expired (less precise than `410`).

---

## §8 — Audit log (FR-024)

**Decision**: A new narrow port, `IBookingAuditLogger { logBookingConfirmation(entry: { outcome, clientId, quoteId, bookingId? }): void }`, in `goalkeeperRequests/common/ports.ts`. `PinoAuditLogger` implements it alongside `IAuditLogger`, logging `{ audit: 'booking_confirmation', ... }` at `info` for `created`/`replayed` and at `warn` for refusals. The handler calls it exactly once per confirmation, whatever the outcome.

**Rationale**: Matches the existing SSO audit pattern (structured pino entry with an `audit` discriminator). A feature-owned port keeps `goalkeeperRequests` from importing the `auth` feature's port.

**Alternatives considered**: extending `IAuditLogger` in `auth/common/ports.ts` (a cross-feature dependency the layering tests would allow but that muddies ownership); logging from the controller (misses the classification detail and is harder to unit-test).

---

## §9 — Clocks and expiry

**Decision**: The application's `IClock` (the existing `SystemClock` in production, `FixedClock` in tests) decides validity. `issuedAt`/`expiresAt` are written from it, and the claim filter compares against it. The TTL monitor uses the database server's clock and only ever removes quotes already past `expiresAt`. Small skew between the two only changes how long an expired quote lingers, never whether it can be confirmed.

**Rationale**: Validity has to be testable with `FixedClock` at the exact boundary (SC-004), and correctness can't depend on when the TTL monitor happens to run (FR-020).

**Alternatives considered**: `$$NOW` in the claim filter (uses the server clock, can't be controlled in tests, and splits the rule between two clocks).

---

## §10 — Status values and naming

**Decision**: Stored values follow the repository's lower-case convention (e.g. `goalkeeperRegistrations.status: 'active'`). Quote `status` is always `'pending'` while stored; it is kept for readability and future use, and no code branches on it. Booking `status` starts as `'pending_assignment'` (spec: "confirmed, awaiting goalkeeper assignment"). Field names are camelCase as everywhere in this codebase: `clientId` (spec's `user_id`), `issuedAt` (`created_at`), `expiresAt` (`expires_at`); `match` and `pricing` hold the spec's `match_details` and `pricing`.

**Rationale**: Consistency with the rest of the database. The spec's `PENDING`/`CONSUMED`/`EXPIRED` enumeration was superseded by the clarification: consumed and expired quotes are deleted, not stored in another state.

---

## §11 — Testing strategy under the "no real database in tests" rule

**Decision**: Same three tiers as 001–007:
- **Domain unit tests**: `Quote.issue` (expiry = issuedAt + 3 min, copies pricing), `Booking.fromQuote` (copies match/pricing, `pending_assignment`, carries `quoteId`/`quoteIssuedAt`).
- **Handler unit tests** against in-memory fakes (`FakeQuoteRepository`, `FakeBookingRepository`, a `FakeQuoteConfirmationStore` that applies the same claim/unique rules in memory) plus `FixedClock`: every branch of §3, boundary at `expiresAt − 1 s` vs `expiresAt` (SC-004), replay after expiry (SC-003), duplicate match (SC-008 sequential), refusal leaves the quote untouched (FR-021), audit called once per outcome. The issue handler: success stores exactly one quote with the right expiry, refusals store none, and a storage failure propagates.
- **Repository/store unit tests** against the mocked `Collection` (`createFakeCollection`, extended with `findOneAndDelete`) and a mocked `MongoClient.startSession()` whose `withTransaction(fn)` invokes `fn`: the exact filter (including `expiresAt: { $gt: now }` and `clientId`), `{ session }` passed to both writes, `11000` classified by `keyPattern`, `endSession` always called, TTL and unique index definitions.
- **HTTP tests** (`supertest`) for `POST /bookings`: `201`, `200` replay, and one per refusal code, plus `401`/`403`. `POST /quote` now returns `quoteId`/`expiresAt` and the old fields are unchanged.

True concurrency (SC-001, SC-008 simultaneous) and crash atomicity (SC-005) depend on the real server's transaction semantics, so unit tests can't prove them under this rule. They are covered by the **manual verification script in quickstart.md §4**, run against the Atlas dev cluster.

**Rationale**: Respects the product rule that tests never depend on a real resource, while still pinning every piece of logic this system owns. The guarantees that come from the database are verified where the database is.

**Alternatives considered**: `mongodb-memory-server` replica-set tests (contradicts the documented product direction from 2026-08-29).
