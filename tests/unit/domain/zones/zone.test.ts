import { describe, expect, it } from 'vitest';
import { Zone } from '../../../../src/domain/zones/zone.js';

const base = {
  id: 'z1',
  marketId: 'med',
  name: 'Laureles',
  slug: 'laureles',
  geometry: { type: 'Polygon' as const, coordinates: [] },
  active: true,
  displayOrder: 1,
};

describe('Zone market', () => {
  it('belongs to one market (spec 031, FR-002)', () => {
    expect(new Zone(base).marketId).toBe('med');
  });
});

describe('Zone revision', () => {
  it('defaults to 0 and keeps a stored value', () => {
    expect(new Zone(base).revision).toBe(0);
    expect(new Zone({ ...base, revision: 9 }).revision).toBe(9);
  });

  it('rejects a broken revision', () => {
    expect(() => new Zone({ ...base, revision: Number.NaN })).toThrow(/zones document z1: revision/);
  });
});
