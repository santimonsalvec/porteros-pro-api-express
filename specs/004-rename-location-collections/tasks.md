# Tasks: Align Code with Renamed Location Collections

**Input**: Design documents from `/specs/004-rename-location-collections/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: No new/changed test tasks — research.md confirmed the existing unit tests use fakes/doubles and never assert the collection-name literal, so no test needs to change. A verification task re-runs the existing suite to confirm this.

**Organization**: This feature has a single user story (US1). There is no Setup or Foundational phase: the change touches one existing file in an already-initialized project, introduces no new dependency, schema, or infrastructure.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1)

## Path Conventions

Single project: `src/`, `tests/` at repository root (per plan.md).

---

## Phase 1: User Story 1 - Country lookups keep working after the database rename (Priority: P1) 🎯 MVP

**Goal**: Country lookups (list all, get by id, get by country code) keep returning correct results after the database owner renamed the `Countries` collection to `countries`, with no remaining code references to the old name.

**Independent Test**: Point the app at a database where the collection is named `countries`, then call the country list/get endpoints (or invoke `CountryRepository` directly) and confirm correct results; grep the repo for the old literal and confirm zero matches.

### Implementation for User Story 1

- [X] T001 [US1] In `src/infrastructure/persistence/mongo/countryRepository.ts`, change `db.collection('Countries')` (line 15) to `db.collection('countries')`, and rewrite the doc comment above the class (lines 5–10) so it no longer describes preserving the old `Countries` capitalization — describe it as reading the externally-owned `countries` collection instead.
- [X] T002 [P] [US1] Grep the repository for any remaining literal reference to the old collection name (`grep -rn "'Countries'" src tests`, excluding `node_modules`) and confirm it returns no results, satisfying SC-002.

### Verification for User Story 1

- [X] T003 [P] [US1] Run `npm test` and confirm `tests/unit/infrastructure/persistence/mongo/countryRepository.test.ts` and `tests/unit/application/features/locations/getCountries.test.ts` still pass unmodified.
- [ ] T004 [US1] Follow `specs/004-rename-location-collections/quickstart.md` end to end against a database with the renamed `countries` collection: verify `getAll()`, `getById()`, and `findByCountryCode()` return correct results (SC-001). **Manual step — requires a live database connection; not run by this automated pass.**

**Checkpoint**: User Story 1 is fully functional and independently verified — country lookups work against the renamed collection, and no code references the old name.

---

## Phase 2: Polish & Cross-Cutting Concerns

**Purpose**: Final repo-wide hygiene check now that the story is complete.

- [X] T005 Run `npm run lint` to confirm the edited file passes existing style/type checks.

---

## Dependencies & Execution Order

### Phase Dependencies

- **User Story 1 (Phase 1)**: No dependencies — can start immediately.
- **Polish (Phase 2)**: Depends on User Story 1 (T001) being complete.

### Within User Story 1

- T001 must complete before T002, T003, and T004 (they all verify the result of T001).
- T002 and T003 can run in parallel with each other once T001 is done.
- T004 is a manual/end-to-end check; run after T002/T003 pass.

### Parallel Opportunities

- T002 and T003 are marked `[P]` — different concerns (a grep vs. running the test suite), no file conflicts, both depend only on T001.

---

## Parallel Example: User Story 1

```bash
# After T001 (the code change) is done, run these together:
Task: "Grep the repository for any remaining literal reference to 'Countries'"
Task: "Run npm test and confirm the existing country tests still pass"
```

---

## Implementation Strategy

### MVP First (and only) Scope

1. Complete Phase 1 (T001–T004) — this **is** the entire feature; there is nothing to sequence after it besides the lint check.
2. Complete Phase 2 (T005).
3. Deploy: this change is safe to ship as soon as the target database's collection has been renamed to `countries` (already true per the user's report).

## Notes

- No Setup or Foundational phase: nothing to scaffold, no new dependency, no schema/migration framework to configure.
- Only one user story exists for this feature; `Cities`/`States`/`stateId`→`regionId` are explicitly out of scope (spec FR-005) and have no tasks here.
- Commit after T001 plus its verification tasks (T002–T004) as one logical group.
