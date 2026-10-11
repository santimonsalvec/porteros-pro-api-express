import { describe, expect, it } from 'vitest';
import { Country } from '../../../../src/domain/countries/country.js';

const base = { id: 'co', name: 'Colombia', dialCode: '+57', countryCode: 'CO' };

describe('Country revision', () => {
  it('defaults to 0 and keeps a stored value', () => {
    expect(new Country(base).revision).toBe(0);
    expect(new Country({ ...base, revision: 3 }).revision).toBe(3);
  });

  it('rejects a broken revision', () => {
    expect(() => new Country({ ...base, revision: -1 })).toThrow(/countries document co: revision/);
  });
});
