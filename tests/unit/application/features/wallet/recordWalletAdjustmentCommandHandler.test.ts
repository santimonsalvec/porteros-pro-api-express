import { beforeEach, describe, expect, it } from 'vitest';
import { RecordWalletAdjustmentCommand } from '../../../../../src/application/features/wallet/commands/recordWalletAdjustment/recordWalletAdjustmentCommand.js';
import { RecordWalletAdjustmentCommandHandler } from '../../../../../src/application/features/wallet/commands/recordWalletAdjustment/recordWalletAdjustmentCommandHandler.js';
import { buildGoalkeeperProfile } from '../../../../fixtures/walletFixtures.js';
import { WalletHarness } from './walletHarness.js';

let h: WalletHarness;
let handler: RecordWalletAdjustmentCommandHandler;

beforeEach(() => {
  h = new WalletHarness();
  h.profiles.seed(buildGoalkeeperProfile('gk-1'));
  handler = new RecordWalletAdjustmentCommandHandler(h.context, h.ledger, h.store);
});

const adjust = (amount: number, operationKey: string, goalkeeperId = 'gk-1') =>
  handler.handle(new RecordWalletAdjustmentCommand('admin-1', goalkeeperId, amount, 'Saldo inicial de pruebas', operationKey));

describe('RecordWalletAdjustmentCommandHandler — US5: manual adjustments', () => {
  it('records a credit with the administrator, the reason and the resulting balance', async () => {
    expect(await adjust(50000, 'k-1')).toMatchObject({
      outcome: 'recorded',
      balance: 50000,
      movement: { type: 'admin_adjustment', amount: 50000, reason: 'Saldo inicial de pruebas', actor: { kind: 'admin', userId: 'admin-1' } },
    });
  });

  it('records a debit the balance can cover', async () => {
    await adjust(50000, 'k-1');

    expect(await adjust(-10000, 'k-2')).toMatchObject({ outcome: 'recorded', balance: 40000 });
  });

  it('refuses a debit that would leave the balance below 0, recording nothing', async () => {
    await adjust(5000, 'k-1');

    expect(await adjust(-6000, 'k-2')).toEqual({ outcome: 'insufficient_funds', balance: 5000 });
    expect(h.store.movements()).toHaveLength(1);
  });

  it('answers a repeated operation key with the original movement, recording nothing new', async () => {
    const first = await adjust(50000, 'k-1');
    const again = await adjust(50000, 'k-1');

    expect(again).toMatchObject({ outcome: 'replayed', balance: 50000 });
    expect(again.outcome === 'replayed' && first.outcome === 'recorded' && again.movement.movementId).toBe(
      first.outcome === 'recorded' && first.movement.movementId,
    );
    expect(h.store.movements()).toHaveLength(1);
  });

  it('refuses a user who is not an active goalkeeper', async () => {
    expect(await adjust(50000, 'k-1', 'someone')).toEqual({ outcome: 'not_a_goalkeeper' });
  });
});
