---
description: "Task list for 024-match-format-pricing (backend)"
---

# Tasks: Match format, tiered pricing and offer dismissal (backend)

**Input**: `specs/024-match-format-pricing/` (plan.md, data-model.md, contracts/match-format.md)
**Tests**: included — the repo covers every handler and domain rule with vitest.
**Order**: backend first; the app (`porteros_pro_app/specs/024-match-format-pricing/tasks.md`)
starts its data layer once Phase 3 is deployed to dev.

Format: `[ID] [P?] [Story] Description` — `[P]` = parallelizable (different files).

## Phase 1: Setup

- [x] A001 Create `src/domain/bookings/matchFormat.ts`: `Modality`, `MatchLevel`, `MODALITIES`, `MATCH_LEVELS`, `MatchFormat` (validates; `surfaceId`/`surfaceName` non-empty) + unit tests in `tests/unit/domain/`.
- [x] A002 [P] Create `src/domain/pricing/matchSurface.ts` (`MatchSurface`: id, name, active, order; `InvalidConfigurationError` on bad docs) + tests.
- [x] A003 [P] Create `scripts/seed-match-surfaces.ts` (upsert the 5 defaults of contract §1; same env/connection pattern as `scripts/dev-credit-wallet.ts`).

## Phase 2: Foundational — tiered pricing (blocks US1)

- [x] A004 `RentalRate` and `CommissionSetting` accept optional `modality` (stored modalities only, never `any`) and `level`; level without modality throws. Tests.
- [x] A005 Create `common/tieredRate.ts`: `candidatesFor(format)` and `resolveTiered(levels, format)` (contract §5). Matrix unit tests: each modality × level × which docs exist at zone/city/country, including "zone general beats city F11" and `any` + `competitive` → general (SC-002).
- [x] A006 `RentalRateRepository`: `findForDuration` returns every zone/city doc for the duration (all modality/level variants); `ensureIndexes` drops `scope_refId_durationMinutes` if present and creates `scope_refId_duration_modality_level`. Update `IRentalRateRepository` in `common/ports.ts` and the fake in `tests/fakes`.
- [x] A007 `CommissionSettingRepository`: map `modality`/`level`; replace index `scope_refId` → `scope_refId_modality_level`. Update fake.
- [x] A008 `CommissionResolver`: add `resolveForFormat(zoneId, format)`; change `resolveForZones` to return the lowest commission over the 7 formats per zone (plan decision 4). Update `ICommissionResolver` and tests (wallet `offersStatus` and offer eligibility keep passing).
- [x] A009 Replace `selectUnitRate` in `common/pricing.ts` with the tiered resolver (rates: zone → city).

## Phase 3: US1 — the client quotes with a match format (P1) 🎯 MVP

- [x] A010 [US1] `MatchSurfaceRepository` (Mongo, read-only): `listActive()` sorted by `order`, `name`; `findById(id)`. Port in `goalkeeperRequests/common/ports.ts`, fake, wiring in `appDependencies.ts`.
- [x] A011 [US1] `getBookingConfig` query/handler returns `surfaces` (contract §1); controller serializes it; HTTP test.
- [x] A012 [US1] `getServiceQuoteRequest.ts`: required `modality` (incl. `any`), `level`, `surfaceId`; field errors keyed by those names. HTTP tests for each missing/invalid field.
- [x] A013 [US1] `ServiceQuoteInput` gains `format` input; `GetServiceQuoteQueryHandler` loads the surface (unknown/inactive → new outcome `unknown_surface`), resolves rate with `resolveTiered` and commission with `resolveForFormat`; result carries `matchFormat`. Unit tests for each outcome.
- [x] A014 [US1] Controller maps `unknown_surface` → `400 validation_failed` with `fieldErrors.surfaceId` (contract §2); quote `200` body includes `matchFormat`.
- [x] A015 [US1] `MatchDetails` gains `format: MatchFormat | null`; `IssueServiceQuoteCommandHandler` sets it; `QuoteRepository` and `GoalkeeperRequestRepository` persist/read `match.format` (missing → `null`); `ConfirmBookingCommandHandler` carries it from quote to request. Round-trip tests with the fakes and a legacy document without `format`.
- [x] A016 [US1] `openapiSpec.ts`: config `surfaces`, quote fields and `matchFormat`.

**Checkpoint**: deploy to dev (`despliega-api-dev`), seed surfaces and a test rate matrix in dev — **ask the user before writing to the dev database**.

## Phase 4: US2 — the goalkeeper sees the format (P1)

- [x] A017 [P] [US2] Shared serializer `toMatchFormatResponse(format | null)` (contract §0) in `common/`.
- [x] A018 [US2] `requestResponse.ts` (client requests list/confirm) adds `matchFormat`. HTTP test.
- [x] A019 [US2] `goalkeeperBookingResponse.ts`: `AvailableBookingItem` (thus agenda) adds `matchFormat`. HTTP tests for available-bookings and agenda.
- [x] A020 [US2] `offerMessages.ts`: `OfferMatch.format`; title/body per contract §4; `offerSender.ts` passes `request.match.format`. Unit tests for each modality, `any` and legacy `null`.

## Phase 5: US3 — "No me interesa" (P2)

- [x] A021 [US3] `Booking.dismissedGoalkeeperIds` (default `[]`), persisted in `BookingRepository`; `isEligible` rejects a dismissing goalkeeper. Domain tests.
- [x] A022 [US3] Repository method `dismissRequestFor(requestId, goalkeeperId)` (`$addToSet` on all bookings of the request). Fake + test.
- [x] A023 [US3] Replacement bookings (feature 018, where `replacesBookingId` is set) copy `dismissedGoalkeeperIds`. Test.
- [x] A024 [US3] `commands/dismissBooking/` command + handler: 404 unknown booking, 409 `booking_held` when the goalkeeper holds a booking of the request, otherwise record (idempotent; also 200 when the booking is no longer open). Unit tests.
- [x] A025 [US3] Route `POST /api/goalkeepers/me/bookings/:bookingId/dismiss` in `goalkeeperController.ts` (contract §6) + OpenAPI + HTTP tests (incl. that the booking disappears from `available-bookings` and that accept is refused).

## Phase 6: Polish

- [x] A026 `npm test && npm run lint` green; `npm run build`.
- [x] A027 Update `CLAUDE.md` Active Technologies via the speckit agent-context script (or by hand, same style).
- [ ] A028 Deploy to dev (`despliega-api-dev`) after the app is ready to test end to end.
- [ ] A029 Leave changes uncommitted; propose commit messages to the user (no automatic commits).
