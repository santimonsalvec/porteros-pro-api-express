import { describe, expect, it } from 'vitest';
import { canStopBeingAnchor, canUseAnchor, daneCodesValid } from '../../../../src/domain/locations/locationRules.js';

describe('canUseAnchor', () => {
  const medellin = { id: 'med', zoneCityId: null };

  it('accepts another city that owns its zones', () => {
    expect(canUseAnchor('env', medellin)).toBe(true);
  });

  it('rejects a missing anchor, the city itself and a satellite (no chains)', () => {
    expect(canUseAnchor('env', null)).toBe(false);
    expect(canUseAnchor('med', medellin)).toBe(false);
    expect(canUseAnchor('env', { id: 'ita', zoneCityId: 'med' })).toBe(false);
  });
});

describe('canStopBeingAnchor', () => {
  it('only when the city has no zones of its own and no city uses it as anchor', () => {
    expect(canStopBeingAnchor(false, false)).toBe(true);
    expect(canStopBeingAnchor(true, false)).toBe(false);
    expect(canStopBeingAnchor(false, true)).toBe(false);
  });
});

describe('daneCodesValid', () => {
  it.each([
    [null, null],
    ['05', null],
    ['05', '05001'],
  ])('accepts state %s and city %s', (state, city) => {
    expect(daneCodesValid(state, city)).toBe(true);
  });

  it.each([
    ['5', null],
    ['05', '5001'],
    ['05', '06001'],
    [null, '05001'],
    ['0a', null],
  ])('rejects state %s and city %s', (state, city) => {
    expect(daneCodesValid(state, city)).toBe(false);
  });
});
