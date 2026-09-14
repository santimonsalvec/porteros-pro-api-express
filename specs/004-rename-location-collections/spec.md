# Feature Specification: Align Code with Renamed Location Collections

**Feature Branch**: `004-rename-location-collections`
**Created**: 2026-09-13
**Status**: Draft
**Input**: User description: "en la base de datos he realizado algunos cambios y necesito que no haya ningun problema con el codigo, si hay cosas que aún no usamos por favor omítelo y lo veremos en el futuro, aquí van los cambios: la colección \"Countries\" ahora se llama \"countries\"; la colección \"Cities\" ahora se llama \"cities\"; la colección \"States\" ahora se llama \"regions\"; en la colección \"cities\" había una propiedad llamada \"stateId\", ahora esta se llama \"regionId\"."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Country lookups keep working after the database rename (Priority: P1)

As an API consumer of the porteros-pro platform, when I request country reference data (for example, during portero registration or profile lookups), I must keep receiving correct results after the database owner renamed the underlying collection, so that no existing flow that depends on country data breaks.

**Why this priority**: This is the only location-reference-data path the system currently reads from in production code. Any mismatch between the collection name the code expects and the collection name that now exists in the database causes country lookups to silently return empty results or fail, breaking every feature that depends on country data (e.g., portero registration).

**Independent Test**: Can be fully tested by querying the system's country data (list all countries, look up a single country by id, look up a country by its dial/country code) against a database where the collection is named `countries` (lowercase) and confirming correct results are returned, with no references to the old `Countries` name remaining in the code path.

**Acceptance Scenarios**:

1. **Given** the database now stores country reference data in a collection named `countries`, **When** the system retrieves the full list of countries, **Then** it returns the same countries it would have returned prior to the rename.
2. **Given** the database now stores country reference data in a collection named `countries`, **When** the system looks up a single country by its identifier or by its country code, **Then** it returns the matching country record.
3. **Given** the renamed collection, **When** any part of the system attempts to read country data, **Then** no part of the code still queries the old `Countries` name.

---

### Edge Cases

- What happens if the old, capitalized `Countries` collection still exists alongside the new `countries` one (e.g., during a transition window)? The system MUST only ever read from the new `countries` name going forward; it is not responsible for reconciling or migrating data left behind under the old name.
- What happens to functionality that isn't implemented yet (cities, regions/states, and the `regionId` field on cities)? Since no current code path reads the `Cities`, `States`, or `stateId` data, this change requires no code updates for those today — the new names (`cities`, `regions`, `regionId`) are simply the names that MUST be used whenever that functionality is built in the future.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST read country reference data from a collection named `countries`, replacing every reference to the previous `Countries` name.
- **FR-002**: The system MUST continue to support listing all countries, retrieving a country by its identifier, and retrieving a country by its country code, with unchanged behavior other than the underlying collection name.
- **FR-003**: The system's automated tests covering country data retrieval MUST reflect the new `countries` collection name so they continue to validate real behavior.
- **FR-004**: Existing documentation or code comments that describe the country data source as a `Countries` collection MUST be updated to describe it as `countries`, so future contributors aren't misled about the actual database naming.
- **FR-005**: The system MUST NOT introduce any code that reads from or writes to `Cities`, `States`, `cities`, `regions`, `stateId`, or `regionId` as part of this change, since no such functionality exists yet — that work is explicitly deferred to when those features are built.

### Key Entities

- **Country**: Reference data record describing a country (id, name, dial code, country code). Now sourced from the `countries` collection instead of `Countries`. No change to its shape or meaning.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of country-data requests (list, get-by-id, get-by-country-code) return correct results when run against a database where the collection is named `countries`.
- **SC-002**: Zero references to the old `Countries` collection name remain anywhere in the codebase after this change.
- **SC-003**: All automated tests related to country data pass without modification to their expected outcomes (only the underlying collection name reference changes).

## Assumptions

- Only the `Countries` → `countries` rename requires code changes today, because country data is the only one of the four renamed items (`Countries`, `Cities`, `States`, `stateId`) currently read by any code in this repository.
- The `Cities` → `cities`, `States` → `regions`, and `stateId` → `regionId` renames are recorded here for awareness only; no code changes are made for them now, and they MUST be honored (using the new names) whenever city/region functionality is implemented in the future.
- The database owner has already performed the rename in all relevant environments (or will do so before this change is deployed); this feature does not perform any data migration itself.
- No API contracts, response shapes, or public-facing behavior change as a result of this rename — it is purely an internal alignment between the code and the database's current naming.
