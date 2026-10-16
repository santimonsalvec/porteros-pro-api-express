import { describe, expect, it } from 'vitest';
import { covers, holdsCountry, readScopes, scopesIssue, type StaffScope } from '../../../../src/domain/staff/staffScope.js';

const MEDELLIN: StaffScope = { kind: 'market', id: 'med' };
const COLOMBIA: StaffScope = { kind: 'country', id: 'co' };

describe('staff scopes (spec 031, FR-037–FR-042)', () => {
  it('needs at least one scope and no repeated one', () => {
    expect(scopesIssue([])).toBe('scopes_required');
    expect(scopesIssue([MEDELLIN, { kind: 'market', id: 'med' }])).toBe('duplicate_scope');
    expect(scopesIssue([MEDELLIN, COLOMBIA])).toBeNull();
    expect(scopesIssue([{ kind: 'platform' }])).toBeNull();
  });

  it('covers a market through itself, its country or the platform', () => {
    const inMedellin = { countryId: 'co', marketId: 'med' };
    expect(covers([MEDELLIN], false, inMedellin)).toBe(true);
    expect(covers([COLOMBIA], false, inMedellin)).toBe(true);
    expect(covers([{ kind: 'platform' }], false, inMedellin)).toBe(true);
    expect(covers([{ kind: 'market', id: 'bog' }], false, inMedellin)).toBe(false);
    expect(covers([{ kind: 'market', id: 'bog' }], true, inMedellin)).toBe(true);
  });

  it('covers country data only with the whole country, or with one of its markets when the data has one', () => {
    expect(covers([COLOMBIA], false, { countryId: 'co', marketId: null })).toBe(true);
    expect(covers([MEDELLIN], false, { countryId: 'co', marketId: null })).toBe(false);
  });

  it('holds a country only whole or as the platform (FR-041a)', () => {
    expect(holdsCountry([COLOMBIA], false, 'co')).toBe(true);
    expect(holdsCountry([MEDELLIN], false, 'co')).toBe(false);
    expect(holdsCountry([MEDELLIN], true, 'co')).toBe(true);
  });

  it('reads stored scopes, defaulting to the platform and skipping malformed items', () => {
    expect(readScopes(undefined)).toEqual([{ kind: 'platform' }]);
    expect(readScopes([])).toEqual([{ kind: 'platform' }]);
    expect(readScopes([{ kind: 'platform' }, { kind: 'market', id: 'med' }, { kind: 'country' }, { kind: 'zone', id: 'z' }, 'oops'])).toEqual([
      { kind: 'platform' },
      { kind: 'market', id: 'med' },
    ]);
  });
});
