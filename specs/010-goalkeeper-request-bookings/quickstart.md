# Quickstart: Goalkeeper Request with One Booking per Goalkeeper

**Feature**: `010-goalkeeper-request-bookings` | [spec](./spec.md) | [contracts](./contracts/)

## 1. Automated checks

```bash
npm test && npm run lint
npm run test:http
npm run test:architecture
```

## 2. Release cleanup (FR-018, run once per environment, BEFORE starting the new version)

The existing bookings and quotes are development test data (spec clarification 2). Against the target database:

```js
// mongosh
db.bookings.deleteMany({})
db.quotes.deleteMany({})
```

Then start the new version. `ensureIndexes()` will:
- drop the obsolete `bookings` indexes `quoteId_unique`, `client_zone_start_unique` and `client_startsAt`;
- create `bookings.requestId`;
- create the three `goalkeeperRequests` indexes.

Check:

```js
db.bookings.getIndexes()            // _id_, requestId only
db.goalkeeperRequests.getIndexes()  // _id_, quoteId_unique, client_zone_start_active_unique (partial active:true), client_startsAt
```

## 3. Optional: seed the free-cancellation period

```js
db.bookingSettings.updateOne({ scope: 'country', refId: '<country-co id>' }, { $set: { freeCancellationMinutes: 60 } })
```

Without it, quotes use 60 and the API logs `free_cancellation_not_configured` with the city.

## 4. Manual walk-through (dev)

1. `POST /quote` with `goalkeeperCount: 2` → `POST /bookings { quoteId, partialFulfillment: "cancel_all" }`:
   - expect `201`, 2 `bookings` at 60.000 each, a `total` of 120.000 and `status: "searching"`.
2. Repeat the same `POST /bookings`:
   - expect `200` with the same `requestId` and `bookingId`s.
3. Quote and confirm the same zone and start again:
   - expect `409 duplicate_request` with the first `requestId`.
4. Confirm a match that starts in 45 minutes (if the minimum notice allows it):
   - expect `cancellation.freeCancellationAvailable: false`.
5. `GET /bookings`:
   - expect one item per match, with its `bookings[]`, and names.

## 5. Manual concurrency check (SC-001, SC-004)

Fire 100 parallel `POST /bookings` for the same 2-goalkeeper quote:
- `db.goalkeeperRequests.countDocuments({ quoteId })` must be `1`;
- `db.bookings.countDocuments({ requestId })` must be `2`.

Then fire parallel confirmations of different quotes for the same zone and start:
- exactly 1 active request exists.
