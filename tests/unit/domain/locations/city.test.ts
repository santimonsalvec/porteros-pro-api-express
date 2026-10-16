import { describe, expect, it } from 'vitest';
import { City } from '../../../../src/domain/locations/city.js';

const base = { id: 'med', name: 'Medellín', regionId: 'ant' };

describe('City revision', () => {
  it('defaults to 0 and keeps a stored value', () => {
    expect(new City(base).revision).toBe(0);
    expect(new City({ ...base, revision: 4 }).revision).toBe(4);
  });

  it('rejects a broken revision', () => {
    expect(() => new City({ ...base, revision: -2 })).toThrow(/cities document med: revision/);
  });
});
