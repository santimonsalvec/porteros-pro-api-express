# Quickstart: List the Client's Own Bookings (Paginated)

**Feature**: `009-list-client-bookings` | [spec](./spec.md) | [contract](./contracts/list-bookings.md)

## 1. Automated checks

```bash
npm test && npm run lint     # unit tier (pageWindow, handler, repository)
npm run test:http            # supertest: GET /api/goalkeeper-requests/bookings
npm run test:architecture    # layering: no mongodb types in application/domain
```

## 2. Local run

```bash
npm run dev
```

On startup `BookingRepository.ensureIndexes()` creates `client_startsAt` (instant on the small collection).

## 3. Manual walk-through (dev cluster)

Use a client token (`$TOKEN`) whose account has a complete profile.

1. Create a few bookings via `POST /quote` → `POST /bookings` (feature 008), for different start times.
2. First page, defaults:
   ```bash
   curl -s -H "Authorization: Bearer $TOKEN" \
     "http://localhost:3000/api/goalkeeper-requests/bookings" | jq '{page,pageSize,totalItems,totalPages, items: [.items[] | {startsAt, zoneName, cityName, total}]}'
   ```
   Expect upcoming matches first (soonest first), then past ones (most recent first), each with `zoneName`/`cityName`.
3. Small pages: `?pageSize=1&page=1`, `…&page=2`, and so on. Every booking appears exactly once, and the totals stay constant.
4. Page past the end: `?page=999` → `200` with `items: []` and the real totals.
5. Invalid input: `?pageSize=51`, `?page=0`, `?page=abc` → `400 validation_failed` naming the parameter.
6. Isolation: `?clientId=<another user's id>` → the same result as without it.
7. No token → `401`. A goalkeeper-only token → `403`.

## 4. Manual index check (Atlas / mongosh)

```js
db.bookings.getIndexes()   // includes client_startsAt { clientId: 1, startsAt: 1, _id: 1 }

db.bookings.find({ clientId: "<id>", startsAt: { $gte: new Date() } })
  .sort({ startsAt: 1, _id: 1 }).limit(20).explain("executionStats")
// winningPlan: IXSCAN client_startsAt (forward), no SORT stage

db.bookings.find({ clientId: "<id>", startsAt: { $lt: new Date() } })
  .sort({ startsAt: -1, _id: -1 }).limit(20).explain("executionStats")
// winningPlan: IXSCAN client_startsAt (direction: backward), no SORT stage
```
