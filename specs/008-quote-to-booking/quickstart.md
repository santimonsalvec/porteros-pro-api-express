# Quickstart: Persisted Quotes and Idempotent Booking Creation

**Feature**: `008-quote-to-booking` | [plan.md](./plan.md) · [contracts/](./contracts/)

## 1. Prerequisites

1. **A replica-set MongoDB.** Confirmation uses a multi-document transaction (research §1). The Atlas cluster in `MONGODB_CONNECTION_STRING` (`mongodb+srv://…mongodb.net`) already is one. A local standalone `mongod` does **not** support transactions: `POST /bookings` would fail with `500` ("Transaction numbers are only allowed on a replica set member or mongos"). For local work, point at Atlas or start `mongod --replSet rs0` and run `rs.initiate()` once.
2. **Feature 007 data already seeded** (zones, cities with `timeZone`, `bookingSettings`, `rentalRates`, `countries.currency`). A quote must succeed before there's anything to confirm.
3. **No manual index work.** On startup `di.ts` calls `ensureIndexes()` on the two new repositories, creating:
   - `quotes.expiresAt_ttl`: `{ expiresAt: 1 }`, `expireAfterSeconds: 0`
   - `bookings.quoteId_unique`: `{ quoteId: 1 }`, unique
   - `bookings.client_zone_start_unique`: `{ clientId: 1, zoneId: 1, startsAt: 1 }`, unique

   Verify in `mongosh`:
   ```js
   db.quotes.getIndexes()     // expect expiresAt_ttl with expireAfterSeconds: 0
   db.bookings.getIndexes()   // expect both unique indexes
   ```

## 2. Run

```bash
npm run dev                  # API
npm test && npm run lint     # unit tests + lint (project convention)
npm run test:http            # supertest route tests
npm run test:architecture    # layering rules
```

## 3. Try the flow

```bash
TOKEN=...   # access token of a client with a complete profile
API=http://localhost:3000/api/goalkeeper-requests

# 1) Quote: now returns quoteId + expiresAt
QUOTE=$(curl -s -X POST $API/quote -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"latitude":6.2442,"longitude":-75.5812,"startsAt":"<a valid slot ≥ 30 min ahead>","goalkeeperCount":2,"durationMinutes":90}')
echo "$QUOTE"
QID=$(echo "$QUOTE" | jq -r .quoteId)

# 2) Confirm within 3 minutes → 201
curl -i -X POST $API/bookings -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"quoteId\":\"$QID\"}"

# 3) Confirm again → 200, same bookingId
curl -i -X POST $API/bookings -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"quoteId\":\"$QID\"}"
```

Check in `mongosh`: `db.quotes.findOne({_id: QID})` → `null` (deleted by the confirmation); `db.bookings.find({quoteId: QID}).count()` → `1`.

**Expiry**: issue a quote, wait more than 3 minutes, and confirm → `410 quote_expired`. Wait about another minute, until the TTL monitor has run, and confirm → `404 quote_not_found`. `db.quotes.countDocuments({ expiresAt: { $lt: new Date(Date.now() - 5*60*1000) } })` should be `0` (SC-009).

## 4. Manual verification of the database-backed guarantees (SC-001, SC-005, SC-008)

Unit tests never touch a real database (project rule), so the guarantees that come from MongoDB itself are verified once against the dev cluster:

```bash
# SC-001 — 100 simultaneous confirmations of one quote → exactly one 201, the rest 200 (or 409 in_progress)
QID=<fresh quoteId>
seq 100 | xargs -P 100 -I{} curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/bookings \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"quoteId\":\"$QID\"}" | sort | uniq -c
# mongosh: db.bookings.countDocuments({ quoteId: QID })  → 1

# SC-008 — N different quotes for the same zone/start, confirmed at once → one 201, the rest 409 duplicate_booking
#   issue 5 quotes with the same body, collect their ids into quotes.txt, then:
cat quotes.txt | xargs -P 5 -I{} curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/bookings \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"quoteId":"{}"}' | sort | uniq -c
```

**SC-005 (interrupted confirmation)**: temporarily add `throw new Error('boom')` in `MongoQuoteConfirmationStore.claimAndBook` right after `insertOne`, inside the transaction callback. Confirm a quote → `500`. Check that the quote **still exists** and **no booking** exists for it. Remove the throw, confirm again → `201`. Don't commit the throw.

## 5. Cleaning up test data

```js
db.bookings.deleteMany({ clientId: "<your test client id>" })   // bookings are permanent otherwise
// quotes clean themselves up (TTL)
```
