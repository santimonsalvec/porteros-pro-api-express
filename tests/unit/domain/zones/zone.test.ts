import { describe, expect, it } from 'vitest';
import { Zone } from '../../../../src/domain/zones/zone.js';

const base = {
  id: 'z1',
  cityId: 'med',
  name: 'Laureles',
  slug: 'laureles',
  geometry: { type: 'Polygon' as const, coordinates: [] },
  active: true,
  displayOrder: 1,
};

describe('Zone revision', () => {
  it('defaults to 0 and keeps a stored value', () => {
    expect(new Zone(base).revision).toBe(0);
    expect(new Zone({ ...base, revision: 9 }).revision).toBe(9);
  });

  it('rejects a broken revision', () => {
    expect(() => new Zone({ ...base, revision: Number.NaN })).toThrow(/zones document z1: revision/);
  });
});
