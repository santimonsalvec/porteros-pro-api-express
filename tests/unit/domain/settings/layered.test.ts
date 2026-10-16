import { describe, expect, it } from 'vitest';
import { resolveLayered, SETTING_LEVELS, type LayerValues } from '../../../../src/domain/settings/layered.js';

describe('resolveLayered (spec 031, FR-013)', () => {
  it('orders the levels from the most specific', () => {
    expect(SETTING_LEVELS).toEqual(['zone', 'market', 'country', 'platform']);
  });

  it('takes the first level that defines the value, and says which', () => {
    const layers: LayerValues<number> = { zone: null, market: 7, country: 14 };
    expect(resolveLayered(layers)).toEqual({ value: 7, origin: 'market' });
    expect(resolveLayered({ zone: 3, market: 7, country: 14 })).toEqual({ value: 3, origin: 'zone' });
    expect(resolveLayered({ market: null, country: 14 })).toEqual({ value: 14, origin: 'country' });
  });

  it('treats an absent or null level as "inherits"', () => {
    expect(resolveLayered({ country: 14 })).toEqual({ value: 14, origin: 'country' });
    expect(resolveLayered({ zone: undefined, market: null, country: 14 })).toEqual({ value: 14, origin: 'country' });
  });

  it('falls back to the platform value', () => {
    expect(resolveLayered({ market: null, country: null }, 5)).toEqual({ value: 5, origin: 'platform' });
    expect(resolveLayered({ market: null, country: null, platform: 9 })).toEqual({ value: 9, origin: 'platform' });
  });

  it('is missing when no level defines it', () => {
    expect(resolveLayered({ market: null, country: null })).toEqual({ value: null, origin: null });
  });

  it('keeps a defined zero or false', () => {
    expect(resolveLayered({ market: 0, country: 14 })).toEqual({ value: 0, origin: 'market' });
    expect(resolveLayered({ market: false, country: true })).toEqual({ value: false, origin: 'market' });
  });
});
