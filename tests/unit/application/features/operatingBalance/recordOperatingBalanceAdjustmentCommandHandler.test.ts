import { beforeEach, describe, expect, it } from 'vitest';
import { RecordOperatingBalanceAdjustmentCommand } from '../../../../../src/application/features/operatingBalance/commands/recordOperatingBalanceAdjustment/recordOperatingBalanceAdjustmentCommand.js';
import { RecordOperatingBalanceAdjustmentCommandHandler } from '../../../../../src/application/features/operatingBalance/commands/recordOperatingBalanceAdjustment/recordOperatingBalanceAdjustmentCommandHandler.js';
import { buildGoalkeeperProfile } from '../../../../fixtures/operatingBalanceFixtures.js';
import { PaymentsHarness } from '../payments/paymentsHarness.js';
import type { OperatingBalanceHarness } from './operatingBalanceHarness.js';

let p: PaymentsHarness;
let h: OperatingBalanceHarness;
let handler: RecordOperatingBalanceAdjustmentCommandHandler;

beforeEach(() => {
  p = new PaymentsHarness();
  h = p.operatingBalance;
  h.profiles.seed(buildGoalkeeperProfile('gk-1'));
  handler = new RecordOperatingBalanceAdjustmentCommandHandler(h.context, h.ledger, h.store, p.noticeDeps);
});

const adjust = (amount: number, operationKey: string, goalkeeperId = 'gk-1') =>
  handler.handle(new RecordOperatingBalanceAdjustmentCommand('admin-1', goalkeeperId, amount, 'Saldo inicial de pruebas', operationKey));

describe('RecordOperatingBalanceAdjustmentCommandHandler — US5: manual adjustments', () => {
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

  it('tells the goalkeeper, once per movement, with the new balance', async () => {
    await adjust(15000, 'k-1');
    await adjust(15000, 'k-1');

    const notices = await p.notifications.listForUser('gk-1', 0, 10);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      type: 'operating_balance.adjusted',
      title: 'Tu saldo operativo cambió',
      body: '+15.000 COP (Saldo inicial de pruebas). Tu saldo operativo es 15.000 COP.',
    });
  });

  it('tells nothing when the debit is refused', async () => {
    expect(await adjust(-6000, 'k-1')).toMatchObject({ outcome: 'insufficient_funds' });

    expect(await p.notifications.listForUser('gk-1', 0, 10)).toHaveLength(0);
  });

  it('refuses a user who is not an active goalkeeper', async () => {
    expect(await adjust(50000, 'k-1', 'someone')).toEqual({ outcome: 'not_a_goalkeeper' });
  });
});
