# porteros-pro-api Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-09-28

## Active Technologies
- TypeScript ~6.x on Node.js 24 LTS — unchanged, same runtime as the rest of this repository (see `specs/001-porteros-api-migration/plan.md`). + Existing stack (Express 5.2.x, `mongodb` 7.x, `zod`, `uuid`, `pino`) plus three new dependencies scoped to this feature: `cloudinary` 2.x (official Node SDK — the storage provider adapter, see research.md §1); `multer` 2.x with in-memory storage (Express does not parse `multipart/form-data` itself — see research.md §2); `file-type` 22.x (magic-byte content sniffing, so an upload is validated by its actual bytes, not its claimed MIME type or file extension — see research.md §3). (002-cloudinary-image-storage)
- MongoDB — one new collection, `images`, holding one `StoredImage` document per successfully stored image (shape in data-model.md). The underlying file itself lives at Cloudinary; the Mongo document is the system's own generic, provider-independent record of it (FR-004). (002-cloudinary-image-storage)
- TypeScript ~6.x on Node.js 24 LTS — unchanged, same runtime as the rest of this repository. + Existing stack only (Express 5.2.x, `mongodb` 7.x, `zod`, `uuid`, `pino`) plus the already-installed `multer`/`file-type` (feature `002`) reused as-is for the document-photo upload endpoint's own content-sniffing — no new npm dependency is introduced by this feature. (003-convertirse-goalkeeper)
- MongoDB — three new collections: `goalkeeperRegistrations` (one `GoalkeeperRegistration` document per client, the temporary/draft record), `goalkeeperProfiles` (one `GoalkeeperProfile` document per activated goalkeeper, the permanent record), and `documentTypes` (small, manually-seeded reference data mirroring the pre-existing `Countries` collection). See data-model.md. (003-convertirse-goalkeeper)
- TypeScript ~6.x on Node.js 24 LTS (unchanged, existing repo stack) + `mongodb` 7.x driver (official driver, no ODM) — no new dependency (004-rename-location-collections)
- MongoDB — collection `countries` (renamed from `Countries` by the database owner, out of band) (004-rename-location-collections)
- TypeScript ~6.x on Node.js 24 LTS — unchanged, same runtime as the rest of this repository. + Existing stack only (Express 5.2.x, `mongodb` 7.x, `zod`, `uuid`, `pino`) — no new npm dependency. `Zone.geometry` (raw GeoJSON) is stored/returned opaquely; no geometry-processing library is introduced since this system never inspects or validates coordinates, only passes them through. (005-goalkeeper-service-zones)
- MongoDB — three pre-existing, externally owned, read-only collections newly modeled by this system: `cities` (`City`, incl. `regionId`, `zoneCityId`), `regions` (`Region`), `zones` (`Zone`). Plus a shape change to the existing `goalkeeperRegistrations`/`goalkeeperProfiles` collections' `availability`/radius fields (see data-model.md). (005-goalkeeper-service-zones)
- TypeScript ~6.x on Node.js 24 LTS — unchanged, same runtime as the rest of this repository. + Existing stack only (Express 5.2.x, `mongodb` 7.x, `zod`, `uuid`, `pino`) — no new npm dependency. Time-zone conversion uses the runtime's built-in `Intl.DateTimeFormat` (research.md §3) rather than `luxon`; point-in-polygon is delegated to MongoDB `$geoIntersects` (research.md §2), so no geometry library is added either. (007-goalkeeper-service-quote)
- MongoDB — two new collections, `rentalRates` (per zone/city, per duration price) and `bookingSettings` (per country/city window, minimum notice, surcharge tiers), both seeded by the database owner and read-only from this system. Read-only use of `zones` (new point-containment query), plus a new `currency` field on the pre-existing externally-owned `countries`, a new `timeZone` field on `cities` and a `countryId` read from `regions` (city → region → country). See data-model.md. (007-goalkeeper-service-quote)
- TypeScript ~6.x on Node.js 24 LTS. Unchanged, the same runtime as the rest of this repository. + Existing stack only (Express 5.2.x, `mongodb` 7.x, `zod`, `uuid`, `pino`). No new npm dependency. Atomicity uses the `mongodb` driver's own `ClientSession.withTransaction` (research §1). Expiry uses MongoDB's native TTL index (research §4). No Redis or lock service. (008-quote-to-booking)
- MongoDB (Atlas replica set, so transactions are available). Two new collections owned and written by this system: `quotes` (short-lived, deleted on confirmation, otherwise removed by a TTL index on `expiresAt`) and `bookings` (unique on `quoteId` and on `clientId + zoneId + startsAt`). See data-model.md. (008-quote-to-booking)
- MongoDB. No new collection and no shape change. It reads `bookings` (owned by 008) and adds one non-unique index, `client_startsAt`. It also reads `zones` and `cities` (externally owned) for names. (009-list-client-bookings)
- TypeScript ~6.x on Node.js 24 LTS. Unchanged. + Existing stack only (Express 5.2.x, `mongodb` 7.x, `zod`, `uuid`, `pino`). No new dependency. (010-goalkeeper-request-bookings)
- MongoDB (Atlas replica set, transactions available). (010-goalkeeper-request-bookings)
- MongoDB (Atlas replica set, transactions available). Three new collections: (011-goalkeeper-wallet)
- TypeScript ~6.x on Node.js 24 LTS. Unchanged. + The existing stack only. No new dependency. (012-accept-goalkeeper-booking)
- MongoDB (Atlas, transactions). No new collection. New fields on `quotes`, `goalkeeperRequests`, `bookings`, `bookingSettings` and `goalkeeperProfiles`, and 2 new indexes on `bookings`. See [data-model.md](./data-model.md). (012-accept-goalkeeper-booking)
- TypeScript ~6.x on Node.js 24 LTS. Unchanged. + The existing stack only. Pub/Sub is called via its REST API with `google-auth-library` (already installed; research §9). OIDC verification uses the same library. No new dependency. (013-domain-events-outbox)
- MongoDB (Atlas, transactions). New collections `outbox` (TTL on `publishedAt`), `processedEvents`, `jobLocks`, `eventDeliveryLog`; Google Cloud Pub/Sub (topic `booking-events` + DLQ) and Cloud Scheduler (every-minute sweep). (013-domain-events-outbox)
- TypeScript ~6.x on Node.js 24 LTS. Unchanged. + The existing stack only. FCM HTTP v1 is called over REST with `google-auth-library` (already installed; research §1). No new dependency, and no `firebase-admin`. (014-fcm-device-registration)
- MongoDB. One new collection `devices` (`_id` = sha256 of the token, index `userId_lastSeen`, TTL `lastSeen_ttl` 60 days); Firebase Cloud Messaging (APNs key in Firebase). (014-fcm-device-registration)
- TypeScript ~6.x on Node.js 24 LTS. Unchanged. + The existing stack only. The 014 push capability and the 013 events and sweep are reused. Dates are formatted with the built-in `Intl`. No new dependency. (015-notify-eligible-goalkeepers)
- MongoDB. New collections `notifications` (inbox; unique partial index on offers per user+request; TTL 90 days) and `offerPushState`; new field `goalkeeperProfiles.availableForOffers` (absent = on) with index `zone_offers`; new index `bookings.status_searchEnds`. (015-notify-eligible-goalkeepers)
- TypeScript ~6.x on Node.js 24 LTS. Unchanged. + The existing stack only. Reused: 013 (sweep jobs, outbox, relay, consumers), 011 (ledger, `appendMovementInSession`), 014 and 015 (push, inbox). No new dependency. (016-booking-expiry-cancel-all)
- MongoDB (Atlas, transactions). No new collection. New fields `bookings.endedAt/endReason/cancelledBy`, `goalkeeperRequests.cancelAllEvaluatedAt`, `notifications.dedupeKey`; new indexes `goalkeeperRequests.cancelAll_due`, `notifications.dedupe_unique`. (016-booking-expiry-cancel-all)
- TypeScript ~6.x on Node.js 24 LTS. Unchanged. + The existing stack only. Reused: 016's lifecycle store and notices, 011's refund draft, 013's relay. No new dependency. (017-client-cancel-booking)
- MongoDB. No new collection or index. `bookings` gains `cancellationNote`; `endReason` and `cancelledBy` gain values. See [data-model.md](./data-model.md). (017-client-cancel-booking)
- TypeScript ~6.x on Node.js 24 LTS. Unchanged. + The existing stack only. Reused: 016's lifecycle store and notices, 015's eligibility and offer sender, 011's refund draft, 013's relay. No new dependency. (018-goalkeeper-withdrawal-penalties)
- MongoDB (Atlas, transactions). New collection `goalkeeperIncidents` (withdrawals with embedded penalties; indexes `goalkeeper_occurred`, `kind_booking_unique`). New fields `bookings.replacesBookingId/excludedGoalkeeperIds`, `goalkeeperProfiles.penaltiesUpdatedAt`, `bookingSettings.goalkeeperPenalties`; offers become renewable. (018-goalkeeper-withdrawal-penalties)
- TypeScript ~6.x on Node.js 24 LTS. Unchanged. + The existing stack only. Reused: 013 (consumers, sweep), 014 (push), 015/016 (inbox, dedupe keys), 012 (contacts). No new dependency. (019-client-request-notices)
- MongoDB. No new collection. `goalkeeperRequests` gains `contactsRevealedAt` and the index `contactsReveal_due`. (019-client-request-notices)

- TypeScript ~6.x (last JavaScript-hosted compiler generation) on Node.js 24 LTS (Active LTS as of Aug 2026; Node 22 remains Maintenance LTS as a fallback). TypeScript 7.0 (Go-native compiler) is intentionally *not* adopted yet — see research.md for rationale. + Express 5.2.x (web framework); official `mongodb` driver 7.x (no ODM, mirrors the source's raw `MongoDB.Driver` usage); `google-auth-library` 11.x (`OAuth2Client.verifyIdToken`, official equivalent of `Google.Apis.Auth`); `jose` (JWT sign/verify, chosen over legacy `jsonwebtoken` — see research.md); `zod` (request DTO shape validation); `uuid` v9+ (`v7()` for entity ids, matching the source's UUIDv7 convention); `pino` (structured logging, audit-log equivalent); `@opentelemetry/sdk-node` + HTTP/Express auto-instrumentation + OTLP/console exporters (observability parity) (001-porteros-api-migration)

## Project Structure

```text
backend/
frontend/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript ~6.x (last JavaScript-hosted compiler generation) on Node.js 24 LTS (Active LTS as of Aug 2026; Node 22 remains Maintenance LTS as a fallback). TypeScript 7.0 (Go-native compiler) is intentionally *not* adopted yet — see research.md for rationale.: Follow standard conventions

## Recent Changes
- 019-client-request-notices: Added TypeScript ~6.x on Node.js 24 LTS. Unchanged. + The existing stack only. Reused: 013 (consumers, sweep), 014 (push), 015/016 (inbox, dedupe keys), 012 (contacts). No new dependency.
- 018-goalkeeper-withdrawal-penalties: Added TypeScript ~6.x on Node.js 24 LTS. Unchanged. + The existing stack only. Reused: 016's lifecycle store and notices, 015's eligibility and offer sender, 011's refund draft, 013's relay. No new dependency.
- 017-client-cancel-booking: Added TypeScript ~6.x on Node.js 24 LTS. Unchanged. + The existing stack only. Reused: 016's lifecycle store and notices, 011's refund draft, 013's relay. No new dependency.


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
