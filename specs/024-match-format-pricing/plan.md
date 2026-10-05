# Implementation Plan: Match format, tiered pricing and offer dismissal (backend)

**Branch**: `024-match-format-pricing` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)
**Input**: `specs/024-match-format-pricing/spec.md` + the app's full spec.

## Summary

Add a `MatchFormat` (modality, level, surface) to quotes and requests, resolve
the rate and commission with a tiered, geography-first rule over two new
optional fields on `rentalRates`/`commissionSettings`, serve the surfaces from
a new seeded `matchSurfaces` collection, expose `matchFormat` everywhere a
match is described (including the offer push), and let a goalkeeper dismiss an
offer.

## Technical Context

**Language/Version**: TypeScript ~6.x on Node.js 24 LTS. Unchanged.
**Primary Dependencies**: existing stack only (Express 5.2, `mongodb` 7, `zod`). No new dependency.
**Storage**: MongoDB. New collection `matchSurfaces`; new optional fields on `rentalRates`/`commissionSettings` (indexes replaced); `match.format` on `quotes`/`goalkeeperRequests`; `bookings.dismissedGoalkeeperIds`. See [data-model.md](./data-model.md).
**Testing**: vitest (`tests/unit`, `tests/http`, fakes in `tests/fakes`). `npm test && npm run lint`.
**Target Platform**: Firebase App Hosting (dev via the `despliega-api-dev` skill).
**Constraints**: legacy requests without format must keep working; pricing stays integer arithmetic.

## Constitution Check

No `.specify/memory/constitution.md` rules beyond the repo conventions:
clean layering (domain → application → controllers/infrastructure), mediator
handlers, read-only seeded config, fakes over mocks. The plan follows them. PASS.

## Design decisions (research)

1. **Tiered resolver as one pure function** — `resolveTiered(levels, format)` in
   `src/application/features/goalkeeperRequests/common/tieredRate.ts`, used by
   both the rate and the commission. `levels` is an ordered array of the
   documents found per geographic level. Pure → exhaustively unit-tested with a
   matrix (SC-002).
2. **One read per collection** — the repositories fetch every candidate
   document for the zone/city(/country) in one `find` (no extra round trips);
   the resolver picks.
3. **`any` is not stored** — it is the absence of `modality`; a level-only
   document is invalid, which keeps the chain exactly the spec's three steps.
4. **"Can see offers" threshold** — `CommissionResolver.resolveForZones` now
   returns, per zone, the **lowest** commission among the 7 possible formats
   (3 modalities × 2 levels + `any`). This keeps `offersStatus` correct when
   one modality is cheaper than the general one. A new
   `resolveForFormat(zoneId, format)` serves the quote.
5. **Surface snapshot** — the quote stores `surfaceName`, so deactivating or
   renaming a surface never changes existing requests.
6. **Dismissal on bookings, by request** — `$addToSet` on all bookings of the
   request; replacements copy the list. `isEligible` checks it, so the list,
   accept and pushes all honor it with no other change.
7. **Push text** — `singleOfferMessage` takes an optional `format`; the inbox
   stores the same title/body it already copies from the push.
8. **Breaking request** — the quote now requires the three fields (the app is
   not in production; the app ships alongside).

## Project Structure

```text
specs/024-match-format-pricing/
├── spec.md · plan.md · data-model.md · tasks.md
└── contracts/match-format.md

src/domain/bookings/matchFormat.ts            (new)
src/domain/bookings/matchDetails.ts           (format)
src/domain/bookings/booking.ts                (dismissedGoalkeeperIds)
src/domain/bookings/offerEligibility.ts       (dismissed check)
src/domain/pricing/matchSurface.ts            (new)
src/domain/pricing/rentalRate.ts              (modality, level)
src/domain/wallet/commissionSetting.ts        (modality, level)
src/domain/notifications/offerMessages.ts     (format in text)
src/application/features/goalkeeperRequests/common/tieredRate.ts   (new)
src/application/features/goalkeeperRequests/common/{pricing,ports,requestResponse,goalkeeperBookingResponse}.ts
src/application/features/goalkeeperRequests/queries/{getBookingConfig,getServiceQuote}/…
src/application/features/goalkeeperRequests/commands/{issueServiceQuote,confirmBooking}/…
src/application/features/goalkeeperRequests/commands/dismissBooking/…  (new)
src/application/features/wallet/common/{commissionResolver,ports}.ts
src/application/features/notifications/common/offerSender.ts
src/controllers/requests/goalkeeperRequests/getServiceQuoteRequest.ts
src/controllers/{goalkeeperRequestsController,goalkeeperController}.ts
src/infrastructure/persistence/mongo/{rentalRate,commissionSetting,matchSurface(new),quote,goalkeeperRequest,booking}Repository.ts
src/infrastructure/openapi/openapiSpec.ts
src/appDependencies.ts
scripts/seed-match-surfaces.ts                 (new)
tests/unit/… tests/http/… tests/fakes/…
```

## Risks

- Replacing unique indexes on seeded collections: `ensureIndexes` must drop the
  old index before creating the new one, and existing documents must not
  collide (they don't: all have no modality/level).
- Replacement bookings (018) must copy `dismissedGoalkeeperIds`; find the
  creation point (`replacesBookingId`) and cover it with a test.
