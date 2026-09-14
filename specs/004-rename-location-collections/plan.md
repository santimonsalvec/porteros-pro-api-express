# Implementation Plan: Align Code with Renamed Location Collections

**Branch**: `004-rename-location-collections` | **Date**: 2026-09-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-rename-location-collections/spec.md`

## Summary

The database owner renamed the `Countries` MongoDB collection to `countries` (and, for not-yet-implemented functionality, `Cities`→`cities`, `States`→`regions`, `stateId`→`regionId`). The only place this repository currently reads from that collection is `CountryRepository`, which hard-codes the literal `'Countries'`. The fix is a single-line change of that literal to `'countries'`, plus updating the doc comment above it that documents the old capitalization, so country lookups (list all, get by id, get by country code) keep working. No other code, tests, or contracts reference the collection name literal, and no code anywhere references `Cities`, `States`, or `stateId`, so nothing else changes.

## Technical Context

**Language/Version**: TypeScript ~6.x on Node.js 24 LTS (unchanged, existing repo stack)
**Primary Dependencies**: `mongodb` 7.x driver (official driver, no ODM) — no new dependency
**Storage**: MongoDB — collection `countries` (renamed from `Countries` by the database owner, out of band)
**Testing**: `vitest` (existing unit test suite)
**Target Platform**: Node.js server (Express 5.2.x API)
**Project Type**: Single project — web service (`src/`, `tests/` at repo root)
**Performance Goals**: N/A — no performance-sensitive change; literal string swap only
**Constraints**: Must not change `CountryRepository`'s public behavior/contract (`getAll`, `getById`, `findByCountryCode`, and the read-only `add`/`update`/`delete` rejections)
**Scale/Scope**: One source file (`src/infrastructure/persistence/mongo/countryRepository.ts`) plus its doc comment; confirmed via repo-wide search that no other file contains the literal `'Countries'` as a collection name, and no file references `Cities`, `States`, or `stateId`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template (no ratified project-specific principles). There are no gates to evaluate against; this check passes vacuously. No complexity, new dependencies, or architectural deviations are introduced by this change, so `Complexity Tracking` is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/004-rename-location-collections/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md         # Phase 1 output (/speckit.plan command)
├── quickstart.md         # Phase 1 output (/speckit.plan command)
└── checklists/
    └── requirements.md
```

No `contracts/` directory: this feature changes no external interface (no HTTP route, request/response shape, or OpenAPI contract changes — `GET` country endpoints keep the exact same behavior).

### Source Code (repository root)

```text
src/
├── infrastructure/
│   └── persistence/
│       └── mongo/
│           └── countryRepository.ts   # db.collection('Countries') -> db.collection('countries'); doc comment update

tests/
└── unit/
    └── infrastructure/
        └── persistence/
            └── mongo/
                └── countryRepository.test.ts   # unaffected (uses a fake collection injected via Db.collection(), never asserts the collection name string)
```

**Structure Decision**: Existing single-project layout (`src/`, `tests/` at repo root, matching `CLAUDE.md`'s "Project Structure"). This feature touches exactly one existing file under `src/infrastructure/persistence/mongo/`; no new modules, directories, or layers are introduced.

## Complexity Tracking

*No violations — table intentionally omitted.*
