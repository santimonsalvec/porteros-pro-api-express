# Phase 0 Research: Align Code with Renamed Location Collections

No `NEEDS CLARIFICATION` markers were left in the Technical Context — this feature has no unresolved unknowns. This document records the two small investigative findings that shaped the plan.

## Decision 1: Where the old collection name is actually referenced in code

- **Decision**: The only literal reference to the MongoDB collection name `Countries` in the entire codebase is `src/infrastructure/persistence/mongo/countryRepository.ts:15` (`db.collection('Countries')`), plus its accompanying doc comment (lines 5–10) that documents the old capitalization.
- **Rationale**: Confirmed by repo-wide search for the exact literals `'Countries'` / `"Countries"` (excluding `node_modules` and the `specs/` planning docs). All other matches for the substring "Countries" are unrelated identifiers that merely contain that word (e.g. `GetCountriesQuery`, `getCountriesQueryHandler.ts`, `countriesResponse.ts`, OpenAPI operation names) — none of them hard-code the Mongo collection name.
- **Alternatives considered**: Searching only within `src/infrastructure/` — rejected in favor of a full-repo search so the doc/comment cleanup (FR-004) and the "zero references remain" success criterion (SC-002) could be verified with confidence.

## Decision 2: Whether existing tests need to change

- **Decision**: No test file needs to change. `tests/unit/infrastructure/persistence/mongo/countryRepository.test.ts` builds `CountryRepository` with a fake `Db` whose `collection()` method ignores its argument and always returns the same fake collection — it never asserts which collection name was requested. `tests/unit/application/features/locations/getCountries.test.ts` exercises the query handler against a hand-rolled repository double and never touches Mongo at all.
- **Rationale**: Since no test asserts on the literal `'Countries'` string, none will fail or need updating once the literal in the repository is changed. This narrows spec requirement FR-003 in practice: there is nothing to update, but the requirement is retained as a safety net (re-run the suite and re-grep after the change) rather than removed, since it costs nothing and guards against missing a reference.
- **Alternatives considered**: Adding a new test that asserts `db.collection` is called with `'countries'` — considered but not required by the spec's success criteria, which are about correct behavior (SC-001) and zero remaining references (SC-002), not about locking in the literal via a dedicated unit test. Left as an option for `/speckit.tasks` to include as an optional hardening step, not a blocking requirement.

## Outcome

All Technical Context fields are resolved with no open questions. Ready for Phase 1 design.
