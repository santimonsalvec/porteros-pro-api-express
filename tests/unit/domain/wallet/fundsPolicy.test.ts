import { describe, expect, it } from 'vitest';
import { canAfford, missingFor, offersStatus } from '../../../../src/domain/wallet/fundsPolicy.js';

describe('fundsPolicy — US4: only matches the goalkeeper can pay for', () => {
  describe('offersStatus (rule a)', () => {
    it.each<[number, (number | null)[], boolean, number | null, number]>([
      [6000, [7000, 9000], false, 7000, 1000],
      [7000, [7000, 9000], true, 7000, 0],
      [8000, [7000, 9000], true, 7000, 0],
      [9000, [7000, 9000], true, 7000, 0],
      [-2000, [7000, 9000], false, 7000, 9000],
      [0, [7000], false, 7000, 7000],
      [8000, [null, 9000], false, 9000, 1000],
      [50000, [null, null], false, null, 0],
      [50000, [], false, null, 0],
    ])('balance %i with zones %j → canSeeOffers %s, lowest %s, missing %i', (balance, zones, canSee, lowest, missing) => {
      expect(offersStatus(balance, zones, 0)).toEqual({
        canSeeOffers: canSee,
        lowestCommission: lowest,
        lowestCharge: lowest,
        vatRateBps: 0,
        missingAmount: missing,
      });
    });

    it('compares with the commission plus its VAT (feature 023)', () => {
      expect(offersStatus(7500, [7000, 9000], 1900)).toEqual({
        canSeeOffers: false,
        lowestCommission: 7000,
        lowestCharge: 8330,
        vatRateBps: 1900,
        missingAmount: 830,
      });
      expect(offersStatus(8330, [7000], 1900).canSeeOffers).toBe(true);
    });
  });

  describe('canAfford (rule b)', () => {
    it.each<[number, number | null, boolean]>([
      [6000, 7000, false],
      [7000, 7000, true],
      [8000, 7000, true],
      [8000, 9000, false],
      [9000, 9000, true],
      [-2000, 7000, false],
      [50000, null, false],
    ])('balance %i, commission %s → %s', (balance, commission, expected) => {
      expect(canAfford(balance, commission, 0)).toBe(expected);
    });

    it('needs the VAT too (feature 023)', () => {
      expect(canAfford(8329, 7000, 1900)).toBe(false);
      expect(canAfford(8330, 7000, 1900)).toBe(true);
      expect(missingFor(7500, 7000, 1900)).toBe(830);
      expect(missingFor(9000, 7000, 1900)).toBe(0);
    });
  });
});
