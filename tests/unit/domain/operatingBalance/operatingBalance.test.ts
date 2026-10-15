import { describe, expect, it } from 'vitest';
import { OperatingBalance } from '../../../../src/domain/operatingBalance/operatingBalance.js';

describe('OperatingBalance', () => {
  it('starts empty: balance 0, no movements, in the given currency', () => {
    const now = new Date('2026-09-27T18:00:00.000Z');

    expect(OperatingBalance.empty('gk-1', 'COP', now)).toMatchObject({
      goalkeeperId: 'gk-1',
      currency: 'COP',
      balance: 0,
      lastSequence: 0,
      createdAt: now,
      updatedAt: now,
    });
  });
});
