# Quickstart: Goalkeeper Service Quote

How to prepare the data, run the feature, and check it end to end. Commands use `mongosh` against the same database `MONGODB_CONNECTION_STRING` points to. **The quote refuses every area that lacks configuration — there are no defaults — so steps 1–4 are required before the first successful quote.**

## 1. Country link (confirmed: `city.regionId → region.countryId → country._id`)

The data owner confirmed the hierarchy: a `region` is `{ _id, name, countryId }` and a `city` is `{ _id, name, regionId, timeZone, zoneCityId }`; cities have no `countryId` of their own. The `refId` of a country-level `bookingSettings` document is therefore the `countries._id` (the string stored in `regions.countryId`).

Check that every anchor city resolves to a country (each row must show a `countryId` and a `timeZone`):

```js
const anchors = db.zones.distinct('cityId', { active: true });
db.cities.aggregate([
  { $match: { _id: { $in: anchors } } },
  { $lookup: { from: 'regions', localField: 'regionId', foreignField: '_id', as: 'region' } },
  { $project: { name: 1, timeZone: 1, regionId: 1, countryId: { $arrayElemAt: ['$region.countryId', 0] } } }
])
```

## 1b. Currency of each country

The currency lives on the country, as a `currency` property of the `countries` document (3 uppercase letters). Every rate and surcharge amount is in it, and the quote returns it.

```js
db.countries.find({}, { name: 1, countryCode: 1, currency: 1 })                       // every country you quote in needs one
db.countries.updateOne({ countryCode: 'CO' }, { $set: { currency: 'COP' } })          // if missing
db.countries.find({ currency: { $not: /^[A-Z]{3}$/ } }, { name: 1, currency: 1 })     // malformed values (must be empty)
// Optional cleanup: an old layout stored a currency inside leadTimeSurcharge; it is now ignored
// db.bookingSettings.updateMany({}, { $unset: { 'leadTimeSurcharge.currency': '' } })
```

A country with no `currency` cannot be quoted (`service_not_configured`, `missing: ['currency']`); a malformed one makes quotes fail with a logged 500.

## 2. City time zones (done — verify the values)

The data owner confirmed that every city already has `timeZone`. Only check that the values are exact IANA identifiers (Colombia: `America/Bogota`); an invalid one makes quotes for that city fail with a logged 500.

```js
const anchorIds = db.zones.distinct('cityId', { active: true });
db.cities.distinct('timeZone', { _id: { $in: anchorIds } })        // Colombia: [ 'America/Bogota' ]
db.cities.find({ _id: { $in: anchorIds }, $or: [{ timeZone: { $exists: false } }, { timeZone: null }, { timeZone: '' }] }, { name: 1 })   // must be empty
// Fix, if needed: db.cities.updateMany({ _id: { $in: anchorIds } }, { $set: { timeZone: 'America/Bogota' } })
// A city in another country gets its own IANA id, e.g. 'America/Mexico_City'
```

## 3. Seed booking settings (per country, optional per-city override)

`refId` is the country's `_id` (or a city `_id` for an override). Colombia's current values:

```js
db.bookingSettings.insertOne({
  _id: '<uuid>',
  scope: 'country',
  refId: '<Colombia countries._id>',
  bookingWindowDays: 2,           // today + tomorrow
  minNoticeMinutes: 30,
  leadTimeSurcharge: {
    tiers: [
      { fromMinutes: 0,   toMinutes: 60,   amount: 10000 },
      { fromMinutes: 60,  toMinutes: 120,  amount: 5000 },
      { fromMinutes: 120, toMinutes: null, amount: 0 }
    ]
  }
});

// Optional override: this city allows 4 days; everything else is inherited from the country
db.bookingSettings.insertOne({ _id: '<uuid>', scope: 'city', refId: '<anchor city _id>', bookingWindowDays: 4 });
```

Rules the app enforces on read (a violation makes quotes for that area fail with a logged 500, on purpose): integers only; `bookingWindowDays ≥ 1`; tiers sorted and non-overlapping, only the last one open-ended; one document per `(scope, refId)`.

## 4. Seed rates

One document per place per duration; the zone-level row wins, the city-level row is the fallback:

```js
db.rentalRates.insertMany([
  { _id: '<uuid>', scope: 'city', refId: '<anchor city _id>', durationMinutes: 60,  amount: 40000 },
  { _id: '<uuid>', scope: 'city', refId: '<anchor city _id>', durationMinutes: 90,  amount: 55000 },
  { _id: '<uuid>', scope: 'city', refId: '<anchor city _id>', durationMinutes: 120, amount: 70000 },
  // zone-specific override for one duration only:
  { _id: '<uuid>', scope: 'zone', refId: '<zone _id>',        durationMinutes: 60,  amount: 45000 }
]);
```

Rates and surcharge tiers carry no currency: every amount is in the currency of the country (step 1b).

## 5. Optional but recommended: spatial index on zones

```js
db.zones.createIndex({ geometry: '2dsphere' })
```

The quote works without it (a scan of the small `zones` collection); the index only matters as zones grow. The app never creates it itself (research.md §2) — the build fails if any polygon is invalid.

## 6. Check that every zone polygon is valid (strictly)

MongoDB **silently ignores** a stored zone whose geometry is invalid: the zone never matches any point (every location in it becomes `location_not_covered`) and nothing errors. A plain `$geoIntersects` scan therefore cannot reveal it. Instead use each zone's geometry as the *query* geometry, which MongoDB validates strictly (needs MongoDB 5.1+ for `$documents`):

```js
db.zones.find({ active: true }).forEach(z => {
  try {
    db.aggregate([
      { $documents: [{ loc: { type: 'Point', coordinates: [0, 0] } }] },
      { $match: { loc: { $geoWithin: { $geometry: z.geometry } } } }
    ]).toArray();
    print('✓', z.name);
  } catch (e) { print('⚠', z.name, '→', String(e.message).slice(-220)); }
});
```

Every line must be `✓`. A `⚠` names the reason (for example `Edges 226 and 228 cross`, with their coordinates). Fix the polygon (or regenerate it at its source) and rerun. A `2dsphere` index (§5) can only be built once every zone passes.

## 7. Run the checks

```bash
npm test && npm run lint          # unit + lint (the project's standard gate)
npm run test:http                 # supertest HTTP tests, incl. /api/goalkeeper-requests/quote
npm run test:architecture         # layering: application/domain never import infrastructure
```

## 8. Manual end-to-end check

Start the API (`npm run dev`), sign in as a client with a complete profile, then:

```bash
curl -s -X POST http://localhost:3000/api/goalkeeper-requests/quote \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{ "latitude": 6.2442, "longitude": -75.5812, "startsAt": "2026-09-21T15:00:00", "goalkeeperCount": 2, "durationMinutes": 90 }'
```

Choose `startsAt` between 30 minutes and the end of the allowed window from now, on a `:00`/`:30` mark. Expected: `200` with `unitRate`, `subtotal`, `surcharge`, `total`, `currency`, `startsAt`, `startsAtLocal`, `timeZone`.

Quick refusal checks (each should fail with its own `error` code):

| Change to the request above | Expected `error` |
|---|---|
| `"latitude": 95` | `validation_failed` (`fieldErrors.latitude`) |
| coordinates in the sea | `location_not_covered` |
| `"startsAt": "…T15:15:00"` | `invalid_start_time` (`not_on_slot`) |
| a time 10 minutes from now | `insufficient_notice` |
| a time 3 days ahead | `outside_booking_window` |
| a duration with no rate seeded | `rate_not_configured` |
| a city with no `bookingSettings` at city or country level | `service_not_configured` |

## 9. Acceptance mapping

| Spec item | Where verified |
|---|---|
| Story 1, SC-001 | `getServiceQuoteQueryHandler` unit tests (duration × count × tier matrix) + HTTP happy path |
| Story 2, SC-006 | handler tests: zone wins, city fallback, per-duration fallback, `rate_not_configured` |
| Story 3, SC-004 | one HTTP test per refusal code; `validation_failed` lists `fieldErrors` |
| Story 4, SC-005, SC-009 | handler + `resolveBookingSettings` tests: country, city override, partial override, both missing |
| SC-002 | `FixedClock` boundary tests: 29:59/30:00 notice, 59:59/60:00/119:59/120:00 tiers, window edges |
| SC-008 | `zonedTime` tests: Bogota, Kolkata (+5:30), Kathmandu (+5:45), New York (DST), Lord Howe (30-min DST) |
| SC-007 | handler tests assert no repository write method exists on the used ports |
