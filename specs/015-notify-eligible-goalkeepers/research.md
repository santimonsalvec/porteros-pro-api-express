# Research: Notify Eligible Goalkeepers of Available Matches

**Feature**: `015-notify-eligible-goalkeepers` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

The spec leaves these to the plan:
- how eligible goalkeepers are found from a booking (§2, §3);
- how a round claims goalkeepers so two rounds don't double-push (§6);
- the endpoint paths (§10);
- where the per-country interval is configured (§9).

Clarifications 1–4 (spec) fix the reminder cap, the availability switch, its effect on 012, and the immediate catch-up when the switch is turned on.

---

## §1 One eligibility rule, two directions

**Decision**: A pure domain function decides whether one goalkeeper can take one booking now: `src/domain/bookings/offerEligibility.ts`, `isEligible(snapshot, booking, now)`. `snapshot` holds what 012 already reads about a goalkeeper:

```ts
{
  goalkeeperId, zoneIds, availableForOffers, suspendedUntil,
  balance, canSeeOffers,   // offersStatus() over the goalkeeper's zones
  held: Commitment[],      // assigned bookings
}
```

It returns `true` only when all of these hold:
- `availableForOffers`;
- not suspended at `now`;
- `canSeeOffers`, and `canAfford(balance, booking.commission)`;
- the booking's zone is in `zoneIds`;
- the booking is `pending_assignment` and its search is open at `now`;
- `booking.clientId !== goalkeeperId`;
- `!holdsSameRequest(booking, held)` and `firstConflict(booking, held) === null`.

It reuses 012's `offersStatus`, `canAfford`, `holdsSameRequest` and `firstConflict` unchanged.

Two application services load snapshots and apply it:
- **Goalkeeper → bookings** (`availableBookingsFor(goalkeeperId, now)`). It is extracted from `ListAvailableBookingsQueryHandler` and keeps 012's indexed candidate query. It now also checks the switch. It is used by the available list, the switch catch-up (§8) and the inbox "still available" flag (§11).
- **Bookings → goalkeepers** (`eligibleGoalkeepersFor(bookings, now)`). It loads the candidate goalkeepers of the bookings' zones in batch (§2) and returns `Map<goalkeeperId, Booking[]>`. It is used by the event handler (§4) and the reminder rounds (§6).

**Rationale**:
- FR-002 requires both directions to agree. One predicate, used by both, makes that structural, and a property-style unit test checks it: every pair from the one direction is in the other.
- 012's query stays indexed. The reverse direction batches everything, so a round costs a fixed number of queries.

**Alternatives considered**: running 012's per-goalkeeper query for every goalkeeper of a zone. It is N queries per booking, too slow for rounds (SC-008).

## §2 Finding candidate goalkeepers of a set of zones

**Decision**:
- New multikey index `zone_offers` on `goalkeeperProfiles`: `{ zoneIds: 1, availableForOffers: 1 }`.
- `IGoalkeeperProfileRepository.findOfferCandidates(zoneIds)` returns the profiles with `zoneIds ∈ zoneIds` and `availableForOffers ≠ false`. The field is absent on old documents, so `≠ false` treats absent as on (FR-024), with no migration.

The rest of the snapshot is loaded in batch:
- `IWalletRepository.findByGoalkeeperIds(ids)` (new): one `$in` read;
- `ICommissionResolver.resolveForZones(union of all candidates' zones)`: one call. Each goalkeeper's `canSeeOffers` is computed from that map;
- `IBookingRepository.findAssignedToGoalkeepers(ids)` (new): one `$in` read on the existing `goalkeeper_start` index.

Suspension is filtered in memory, because it's a date compared with `now`.

**Rationale**: About 5 reads per evaluation, whatever the number of goalkeepers. For SC-008 (1,000 goalkeepers), the documents are small.

**Alternatives considered**: denormalizing the balance onto the profile. Rejected: two sources of truth for money.

## §3 Which bookings are open

**Decision**: `IBookingRepository.findOpenPending(now, cap)` (new): `{ status: 'pending_assignment', searchEndsAt: { $gt: now } }`, sorted by `startsAt`, capped at 2,000. A new index `status_searchEnds` (`{ status: 1, searchEndsAt: 1 }`) serves it. Reaching the cap logs `offer_round_cap_reached`.

**Rationale**: Rounds need every open booking across zones. The existing `status_zone_start` index requires zones in the query.

## §4 First notification: an idempotent event consumer

**Decision**:
- `NotifyBookingOffersHandler` implements `INotificationHandler<BookingCreatedEvent>`, with `name = 'goalkeeper-offers'`. It is subscribed to `booking.created` next to 013's delivery log.
- Its effect runs through 013's `runOnce`. It sends `NotifyBookingOffersCommand(bookingId)` through the mediator: the spec input puts eligibility in an application command.

The handler of that command:
1. loads the booking and returns if it's not pending or its search has ended (FR-003, scenario 6);
2. calls `eligibleGoalkeepersFor([booking], now)`;
3. for each eligible goalkeeper, calls `offers.createIfAbsent(goalkeeperId, requestId, …)`. The unique index `(userId, requestId)` on offers (§5) makes this atomic, and **only the caller that inserted** proceeds (FR-005). This covers the second booking of a 2-goalkeeper request and simultaneous deliveries;
4. calls `pushNotifier.sendToUsers(inserted goalkeepers, message)` once. Everyone gets the same message, since it describes this match;
5. marks the inserted offers `notifiedAt = now` and sets each goalkeeper's `lastOfferPushAt = now` (§6);
6. logs `offers_notified { bookingId, requestId, eligible, created, reached, removed, failed }` (FR-022).

The first notification **always** pushes, even if the goalkeeper was pushed less than 5 minutes ago. The interval only governs reminders (FR-009), and speed is the goal (clarification 3's rationale).

**Rationale**:
- The unique index gives exactly-once entries without a transaction.
- A retry after a crash between insert and push finds the entries already there and doesn't push again. The next round then pushes them, because `notifiedAt` is still null (§6). Nothing is lost, and nothing is doubled.

**Local mode note**: with `EVENTS_MODE=local`, 013's relay runs consumers inside the confirmation request, capped at 2 s. A large fan-out may hit the cap: the confirmation still answers, the event stays pending, and the sweep re-delivers it (`runOnce` and the unique index dedupe). SC-007 is fully met in `pubsub` mode; in local mode, confirmation latency is bounded by the relay's 2 s cap, as in 013.

## §5 The inbox: one generic `notifications` collection

**Decision**: Collection `notifications`, one document per message to one user (data-model.md):
- all types: `_id`, `userId`, `type`, `title`, `body`, `data`, `createdAt`, `readAt`;
- offers only: `requestId`, `dismissedAt`, `notifiedAt`, `reminderCount`, `lastRemindedAt`.

Indexes:
- `user_created` `{ userId: 1, createdAt: -1 }`: listing and unread count;
- `offer_unique` `{ userId: 1, requestId: 1 }`, unique, partial on `type: 'booking.available'`;
- `created_ttl`: 90 days (FR-019).

**Rationale**:
- Feature 019 adds client types to the same collection without a schema change.
- Offer-specific fields live on the entry itself, so a round reads one collection to know what was opened, dismissed or reminded.

## §6 Reminder rounds: a scheduled job with a per-goalkeeper claim

**Decision**: `OfferRemindersJob` implements 013's `IScheduledJob`, with `name = 'offer-reminders'` and `leaseSeconds = 55`. It is registered in `di.ts` `jobs: [...]`, so the every-minute sweep runs it. Each run:
1. `findOpenPending(now)`, then `eligibleGoalkeepersFor(open, now)`, giving `goalkeeperId → eligible bookings`, then grouped by request.
2. It loads the existing offers of those goalkeepers for those requests in one `$in` read.
3. Per goalkeeper:
   - creates the missing offers with `createIfAbsent` (FR-011, newly eligible);
   - **open offers** are those with an eligible request, not read, not dismissed, and `reminderCount < maxReminders`. New entries and entries with `notifiedAt == null` are open too.
4. If a goalkeeper has any open offer, it **claims** them:

   ```ts
   offerPushState.tryClaim(goalkeeperId, now, intervalMinutes)
   // findOneAndUpdate(
   //   { _id: goalkeeperId, lastOfferPushAt: { $lte: now − interval } },
   //   { $set: { lastOfferPushAt: now } },
   //   { upsert: true },
   // )
   // E11000 → someone else holds it: skip
   ```

   Only the winner pushes: two concurrent rounds (FR-012), or a round racing a first notification, never double-push.
5. One push per claimed goalkeeper:
   - 1 open offer: the match message (§7), `data { type: 'booking.available', requestId, bookingId }`;
   - several: "Hay N partidos disponibles en tus zonas", `data { type: 'bookings.available' }`.
6. Bookkeeping with one `updateMany` per kind:
   - offers with `notifiedAt == null` get `notifiedAt = now` (their first notification);
   - the others get `$inc reminderCount` and `lastRemindedAt = now` (FR-013: a grouped push counts for each offer).
7. It logs `offer_round { openBookings, goalkeepers, pushed, reached, removed, failed, entriesCreated }` and returns a short summary for the sweep report.

Pushes for the round are sent with bounded parallelism: one `sendToUsers` call per distinct message, 10 goalkeepers at a time.

**Rationale**:
- 013's job lock already stops two sweeps from running the job at once. The per-goalkeeper claim additionally protects against the first notification and the switch catch-up racing a round.
- There are no quiet hours (clarification 1): the job ignores the time of day.

**Alternatives considered**: storing `lastOfferPushAt` on the profile. Rejected: rounds would write to a document that 012 and 018 also write. A tiny collection `offerPushState` is keyed by goalkeeper.

## §7 Message texts (Spanish, city time zone)

**Decision**: `src/domain/notifications/offerMessages.ts`, pure functions:
- `singleOfferMessage({ zoneName, startsAt, timeZone, durationMinutes })`:
  - title: `"Partido disponible"`;
  - body: `"Bello · sáb 4 oct, 3:00 p. m. · 90 min"`;
  - formatted with `Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone })`, normalized (no trailing dots).
- `groupedOfferMessage(n)`:
  - title: `"Partidos disponibles"`;
  - body: `"Hay N partidos disponibles en tus zonas"`.

The zone name comes from `zones`; the time zone and duration from the request's `match`, as in 012's `toAvailableItem`.

**Rationale**: `Intl` is built in (the same choice as 007). A missing zone name falls back to the city name, then to `"tu zona"`.

## §8 The availability switch

**Decision**:
- `GoalkeeperProfile.availableForOffers: boolean`, with default `true` when the stored field is absent (§2).
- `IGoalkeeperProfileRepository.setAvailableForOffers(userId, value)` is a targeted `$set` that returns the previous value (`findOneAndUpdate`, `returnDocument: 'before'`).
- `SetOffersAvailabilityCommand(goalkeeperId, available)`:
  - not a goalkeeper → `not_a_goalkeeper`;
  - it writes the value;
  - on a change from **off to on**, it runs the catch-up: `availableBookingsFor(goalkeeperId, now)`, grouped by request; `createIfAbsent` for requests without an offer; if any were created, one push (single or grouped, §7), sets `notifiedAt` and claims `lastOfferPushAt = now` unconditionally (FR-027);
  - it returns `{ availableForOffers, offersSent }`.
- Endpoint `PUT /api/goalkeepers/me/offers-availability` with `{ "available": true | false }`.
- `GET /api/goalkeepers/me` adds `availableForOffers` for active goalkeepers (null otherwise).

**012 changes** (FR-028):
- `ListAvailableBookingsQuery` gains `unavailableReason: 'not_available_for_offers'`, checked first, before `suspended`;
- `AcceptBookingCommand` gains outcome `not_available_for_offers`, checked right after `replayed`. A retry of an acceptance that already succeeded still answers 200. It maps to `409 goalkeeper_not_available`.

The agenda is untouched.

**Rationale**:
- Only offers the goalkeeper doesn't already have are sent on catch-up: an old offer keeps its reminder count (spec edge case).
- A retried switch-on doesn't push twice: the second call sees "already on" and does nothing.

## §9 Configuration

**Decision**: `config.offers`:
- `reminderIntervalMinutes`: `OFFER_REMINDER_INTERVAL_MINUTES`, default 5;
- `maxReminders`: `OFFER_MAX_REMINDERS`, default 3;
- `roundCap`: 2,000 open bookings.

Global for now.

**Rationale**:
- Colombia is the only country. Per-country values mean a country lookup per goalkeeper in every round for no present benefit.
- The spec's Assumption ("configurable per country") is kept as the direction. When a second country launches, the two values move to `bookingSettings`, which already has country → city resolution. The change is confined to the job and the catch-up.

## §10 Endpoints

| Method and path | Purpose | Success |
|---|---|---|
| `GET /api/notifications?page&pageSize` | the caller's inbox | `200 { items, page, pageSize, totalItems, totalPages, unreadCount }` |
| `POST /api/notifications/{id}/read` | mark one read (and "opened") | `204` |
| `POST /api/notifications/read-all` | mark all read | `204` |
| `POST /api/notifications/{id}/dismiss` | dismiss an offer (also marks it read) | `204`; `409 not_an_offer` for other types |
| `PUT /api/goalkeepers/me/offers-availability` | turn offers on or off | `200 { availableForOffers, offersSent }` |

- The inbox endpoints only need `requireAuth`, like `/api/devices`: any role.
- An unknown id, someone else's entry or a malformed id → `404 notification_not_found` (FR-018).
- The switch requires an active goalkeeper, else `404 goalkeeper_not_found` (the controller's existing mapping).

## §11 "Still available" in the inbox

**Decision**: When listing a page, if it contains offers, the handler calls `availableBookingsFor(userId, now)` once. An offer is `stillAvailable` when its `requestId` is among the returned bookings' requests. Non-offer types get `null`.

**Rationale**:
- One call per page gives exactly 012's answer (FR-015, SC-006).
- A goalkeeper with the switch off sees every offer as not available, which is consistent with clarification 3.

## §12 What is logged

These pino entries, with ids and counts only:
- `offers_notified`;
- `offer_round`;
- `offer_round_cap_reached`;
- `offers_catch_up`;
- `offers_availability_changed { goalkeeperId, availableForOffers }`.

Push-level details are already logged by 014.
