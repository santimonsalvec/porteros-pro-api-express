# Quickstart: Verify the Country Collection Rename

## Prerequisites

- A MongoDB instance/connection configured as usual for this repo (see root `.env` / connection setup), pointed at a database where the country reference data now lives in a collection named `countries` (lowercase).

## Steps

1. Apply the code change: in `src/infrastructure/persistence/mongo/countryRepository.ts`, `db.collection('Countries')` becomes `db.collection('countries')`; update the doc comment above it to stop describing the old capitalization.
2. Run the unit test suite: `npm test`. `tests/unit/infrastructure/persistence/mongo/countryRepository.test.ts` and `tests/unit/application/features/locations/getCountries.test.ts` should pass unmodified (they use fakes/doubles, not a live collection name assertion).
3. Run the linter: `npm run lint`.
4. Manually sanity-check against a real database with the renamed collection (e.g., via the app's locations endpoint or a REPL call into `CountryRepository`):
   - `getAll()` returns the expected list of countries.
   - `getById(<known id>)` returns the matching country.
   - `findByCountryCode(<known code>)` returns the matching country.
5. Confirm no remaining references to the old name: `grep -rn "'Countries'" src tests` (excluding `node_modules`) returns no results.

## Expected outcome

Country lookups behave exactly as before the database rename — the only difference is the collection name the code queries.
