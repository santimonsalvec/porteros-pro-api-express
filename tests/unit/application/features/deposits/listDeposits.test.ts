import { describe, expect, it } from 'vitest';
import { GetDepositQuery } from '../../../../../src/application/features/deposits/queries/getDeposit/getDepositQuery.js';
import { GetDepositQueryHandler } from '../../../../../src/application/features/deposits/queries/getDeposit/getDepositQueryHandler.js';
import { GetDepositByReferenceQuery } from '../../../../../src/application/features/deposits/queries/getDepositByReference/getDepositByReferenceQuery.js';
import { GetDepositByReferenceQueryHandler } from '../../../../../src/application/features/deposits/queries/getDepositByReference/getDepositByReferenceQueryHandler.js';
import { ListDepositsQuery } from '../../../../../src/application/features/deposits/queries/listDeposits/listDepositsQuery.js';
import { ListDepositsQueryHandler } from '../../../../../src/application/features/deposits/queries/listDeposits/listDepositsQueryHandler.js';
import { PaymentsHarness } from '../payments/paymentsHarness.js';

async function threeDeposits(harness: PaymentsHarness) {
  harness.goalkeeper('gk-1');
  harness.goalkeeper('gk-2');
  const ids: string[] = [];
  for (const amount of [10000, 20000, 50000]) {
    ids.push((await harness.start('gk-1', amount)).deposit.depositId);
    harness.clock.advance(60_000);
  }
  await harness.start('gk-2', 10000);
  return ids;
}

describe('ListDepositsQueryHandler', () => {
  it('lists the goalkeeper\'s own deposits, newest first, by page', async () => {
    const harness = new PaymentsHarness();
    const ids = await threeDeposits(harness);
    const handler = new ListDepositsQueryHandler(harness.operatingBalance.profiles, harness.deposits);

    const first = await handler.handle(new ListDepositsQuery('gk-1', 1, 2));
    const second = await handler.handle(new ListDepositsQuery('gk-1', 2, 2));

    expect(first).toMatchObject({ outcome: 'success', page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
    if (first.outcome !== 'success' || second.outcome !== 'success') return;
    expect(first.items.map((item) => item.depositId)).toEqual([ids[2], ids[1]]);
    expect(second.items.map((item) => [item.depositId, item.amount])).toEqual([[ids[0], 10000]]);
    expect(Object.keys(first.items[0]!).sort()).toEqual(
      ['amount', 'cost', 'createdAt', 'currency', 'finalizedAt', 'net', 'reference', 'status', 'depositId'].sort(),
    );
  });

  it('refuses a user who is not a goalkeeper', async () => {
    const harness = new PaymentsHarness();

    expect(await new ListDepositsQueryHandler(harness.operatingBalance.profiles, harness.deposits).handle(new ListDepositsQuery('nobody', 1, 20))).toEqual({
      outcome: 'not_a_goalkeeper',
    });
  });
});

describe('GetDepositQueryHandler', () => {
  it('reads an own deposit and hides another goalkeeper\'s', async () => {
    const harness = new PaymentsHarness();
    const ids = await threeDeposits(harness);
    const handler = new GetDepositQueryHandler(harness.deposits);

    expect(await handler.handle(new GetDepositQuery('gk-1', ids[0]!))).toMatchObject({ outcome: 'success', deposit: { depositId: ids[0], amount: 10000 } });
    expect(await handler.handle(new GetDepositQuery('gk-2', ids[0]!))).toEqual({ outcome: 'not_found' });
    expect(await handler.handle(new GetDepositQuery('gk-1', 'unknown'))).toEqual({ outcome: 'not_found' });
  });
});

describe('GetDepositByReferenceQueryHandler', () => {
  it('shows only the status and amounts', async () => {
    const harness = new PaymentsHarness();
    harness.goalkeeper();
    const { deposit } = await harness.start();
    const handler = new GetDepositByReferenceQueryHandler(harness.deposits);

    expect(await handler.handle(new GetDepositByReferenceQuery(deposit.reference))).toEqual({
      outcome: 'success',
      deposit: { status: 'pending', amount: 20000, net: 18536, currency: 'COP' },
    });
    expect(await handler.handle(new GetDepositByReferenceQuery('PPR-unknown'))).toEqual({ outcome: 'not_found' });
  });
});
