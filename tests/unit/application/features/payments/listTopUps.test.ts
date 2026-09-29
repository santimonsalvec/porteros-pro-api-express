import { describe, expect, it } from 'vitest';
import { GetTopUpQuery } from '../../../../../src/application/features/payments/queries/getTopUp/getTopUpQuery.js';
import { GetTopUpQueryHandler } from '../../../../../src/application/features/payments/queries/getTopUp/getTopUpQueryHandler.js';
import { GetTopUpByReferenceQuery } from '../../../../../src/application/features/payments/queries/getTopUpByReference/getTopUpByReferenceQuery.js';
import { GetTopUpByReferenceQueryHandler } from '../../../../../src/application/features/payments/queries/getTopUpByReference/getTopUpByReferenceQueryHandler.js';
import { ListTopUpsQuery } from '../../../../../src/application/features/payments/queries/listTopUps/listTopUpsQuery.js';
import { ListTopUpsQueryHandler } from '../../../../../src/application/features/payments/queries/listTopUps/listTopUpsQueryHandler.js';
import { PaymentsHarness } from './paymentsHarness.js';

async function threeTopUps(harness: PaymentsHarness) {
  harness.goalkeeper('gk-1');
  harness.goalkeeper('gk-2');
  const ids: string[] = [];
  for (const amount of [10000, 20000, 50000]) {
    ids.push((await harness.start('gk-1', amount)).topUp.topUpId);
    harness.clock.advance(60_000);
  }
  await harness.start('gk-2', 10000);
  return ids;
}

describe('ListTopUpsQueryHandler', () => {
  it('lists the goalkeeper\'s own top-ups, newest first, by page', async () => {
    const harness = new PaymentsHarness();
    const ids = await threeTopUps(harness);
    const handler = new ListTopUpsQueryHandler(harness.wallet.profiles, harness.topUps);

    const first = await handler.handle(new ListTopUpsQuery('gk-1', 1, 2));
    const second = await handler.handle(new ListTopUpsQuery('gk-1', 2, 2));

    expect(first).toMatchObject({ outcome: 'success', page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
    if (first.outcome !== 'success' || second.outcome !== 'success') return;
    expect(first.items.map((item) => item.topUpId)).toEqual([ids[2], ids[1]]);
    expect(second.items.map((item) => [item.topUpId, item.amount])).toEqual([[ids[0], 10000]]);
    expect(Object.keys(first.items[0]!).sort()).toEqual(
      ['amount', 'cost', 'createdAt', 'currency', 'finalizedAt', 'net', 'reference', 'status', 'topUpId'].sort(),
    );
  });

  it('refuses a user who is not a goalkeeper', async () => {
    const harness = new PaymentsHarness();

    expect(await new ListTopUpsQueryHandler(harness.wallet.profiles, harness.topUps).handle(new ListTopUpsQuery('nobody', 1, 20))).toEqual({
      outcome: 'not_a_goalkeeper',
    });
  });
});

describe('GetTopUpQueryHandler', () => {
  it('reads an own top-up and hides another goalkeeper\'s', async () => {
    const harness = new PaymentsHarness();
    const ids = await threeTopUps(harness);
    const handler = new GetTopUpQueryHandler(harness.topUps);

    expect(await handler.handle(new GetTopUpQuery('gk-1', ids[0]!))).toMatchObject({ outcome: 'success', topUp: { topUpId: ids[0], amount: 10000 } });
    expect(await handler.handle(new GetTopUpQuery('gk-2', ids[0]!))).toEqual({ outcome: 'not_found' });
    expect(await handler.handle(new GetTopUpQuery('gk-1', 'unknown'))).toEqual({ outcome: 'not_found' });
  });
});

describe('GetTopUpByReferenceQueryHandler', () => {
  it('shows only the status and amounts', async () => {
    const harness = new PaymentsHarness();
    harness.goalkeeper();
    const { topUp } = await harness.start();
    const handler = new GetTopUpByReferenceQueryHandler(harness.topUps);

    expect(await handler.handle(new GetTopUpByReferenceQuery(topUp.reference))).toEqual({
      outcome: 'success',
      topUp: { status: 'pending', amount: 20000, net: 18536, currency: 'COP' },
    });
    expect(await handler.handle(new GetTopUpByReferenceQuery('PPR-unknown'))).toEqual({ outcome: 'not_found' });
  });
});
