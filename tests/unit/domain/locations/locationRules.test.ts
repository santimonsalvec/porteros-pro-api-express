import { describe, expect, it } from 'vitest';
import { daneCodesValid } from '../../../../src/domain/locations/locationRules.js';

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
