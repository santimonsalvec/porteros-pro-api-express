# Feature Specification: Match format, tiered pricing and offer dismissal (backend)

**Feature Branch**: `024-match-format-pricing`
**Created**: 2026-10-05
**Status**: Clarified
**Full spec and clarifications**: `porteros_pro_app/specs/024-match-format-pricing/spec.md`
(same user stories, FR-001…FR-009, SC-001…SC-004). This file lists only what
the backend owns.

## Backend scope

- **B-001** (FR-002): `GET /goalkeeper-requests/config` returns the active
  `matchSurfaces` (contract §1).
- **B-002** (FR-001, FR-003): the quote requires `modality`, `surfaceId`,
  `level`; it rejects unknown or inactive surfaces (contract §2).
- **B-003** (FR-004, FR-005): the unit rate and the commission are resolved
  with the tiered, geography-first rule (contract §5). The surcharge is
  unchanged; the surface never affects price.
- **B-004** (FR-006): the format is stored on the quote and copied to the
  request; every request/booking response carries `matchFormat` (nullable).
- **B-005** (FR-007): the offer push and its inbox entry name the modality,
  surface and level (contract §4).
- **B-006** (FR-008): `POST /goalkeepers/me/bookings/{id}/dismiss` excludes the
  request (and its future replacements) for that goalkeeper (contract §6).
- **B-007** (FR-009): offer eligibility keeps using the booking's own
  commission; the "can see offers" threshold uses the lowest commission any
  match in the goalkeeper's zones could carry.

## Out of scope

Admin endpoints or screens for rates (data is seeded in Mongo); filtering
offers by modality; a level-only rate (`level` without `modality`).
