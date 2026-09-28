import { describe, expect, it } from 'vitest';
import { Wallet } from '../../../../src/domain/wallet/wallet.js';

describe('Wallet', () => {
  it('starts empty: balance 0, no movements, in the given currency', () => {
    const now = new Date('2026-09-27T18:00:00.000Z');

    expect(Wallet.empty('gk-1', 'COP', now)).toMatchObject({
      goalkeeperId: 'gk-1',
      currency: 'COP',
      balance: 0,
      lastSequence: 0,
      createdAt: now,
      updatedAt: now,
    });
  });
});
