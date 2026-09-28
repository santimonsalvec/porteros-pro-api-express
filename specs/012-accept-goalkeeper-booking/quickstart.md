# Quickstart: Goalkeepers See Available Matches and Accept One

**Feature**: `012-accept-goalkeeper-booking` | [spec](./spec.md) | [contract](./contracts/goalkeeper-bookings.md)

## 1. Automated checks

```bash
npm test && npm run lint
npm run test:http
npm run test:architecture
```

## 2. Release cleanup (dev test data, as in 010) — before starting the new version

```js
// mongosh
db.bookings.deleteMany({})
db.goalkeeperRequests.deleteMany({})
db.quotes.deleteMany({})
```

Optional settings (otherwise the defaults are 30 minutes plus a warning; a commission is **required** to quote):

```js
db.bookingSettings.updateOne({ scope: 'country', refId: '<Colombia id>' }, { $set: { travelBufferMinutes: 30 } })
db.commissionSettings.insertOne({ _id: 'commission-co', scope: 'country', refId: '<Colombia id>', amount: 7000 })  // from 011
```

## 3. Manual walk-through (dev)

1. As an admin, credit the goalkeeper 50.000 (011 adjustment endpoint).
2. As a client, quote and confirm a 2-goalkeeper request in a zone the goalkeeper has enabled.
3. As the goalkeeper:
   - `GET /api/goalkeepers/me/available-bookings` → 2 items, each with `earnings` and `commission` and no client data;
   - `POST /api/goalkeepers/me/bookings/<bookingId>/accept` → 201, and the wallet drops by the commission;
   - accept again → 200, with no second charge;
   - accept the other booking of the same request → `409 same_request`.
4. As the client: `GET /api/goalkeeper-requests/bookings` → request `partially_assigned`, and the assigned booking shows the goalkeeper's name and WhatsApp.
5. As the goalkeeper: `GET /api/goalkeepers/me/bookings` → the booking, with the client's name and WhatsApp.

## 4. Manual concurrency checks (SC-001, SC-002)

- 100 goalkeepers accept the same booking in parallel → exactly 1 `assigned`, and exactly 1 `commission:<bookingId>` movement.
- One goalkeeper accepts 3 clashing bookings in parallel → exactly 1 assigned, and 1 charge.
