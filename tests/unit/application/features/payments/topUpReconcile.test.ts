import { describe, expect, it } from 'vitest';
import { buildGoalkeeperProfile } from '../../../../fixtures/walletFixtures.js';
import { PaymentsHarness } from './paymentsHarness.js';

const MINUTE = 60_000;

async function pendingTopUp(harness: PaymentsHarness) {
  harness.goalkeeper();
  const { topUp } = await harness.start();
  return topUp;
}

/** Moves the clock to `minutes` after the top-up's creation and runs the job. */
async function runAt(harness: PaymentsHarness, createdAt: string, minutes: number) {
  harness.clock.set(new Date(new Date(createdAt).getTime() + minutes * MINUTE));
  return harness.reconcileJob().run(harness.clock.now());
}

describe('TopUpReconcileJob', () => {
  it('does not ask before 15 minutes', async () => {
    const harness = new PaymentsHarness();
    const topUp = await pendingTopUp(harness);

    expect(await runAt(harness, topUp.createdAt, 14)).toBe('0 checked, 0 applied, 0 expired, 0 failed');
    expect(harness.gateway.queries).toEqual([]);
  });

  it('credits an approval found at 15 minutes once, and a later confirmation changes nothing', async () => {
    const harness = new PaymentsHarness();
    const topUp = await pendingTopUp(harness);
    harness.gateway.answer(harness.answer(topUp.reference, 'APPROVED'));

    expect(await runAt(harness, topUp.createdAt, 15)).toBe('1 checked, 1 applied, 0 expired, 0 failed');
    expect(harness.gateway.queries).toEqual([{ reference: topUp.reference, environment: 'sandbox' }]);
    expect((await harness.wallet.store.findByGoalkeeperId('gk-1'))?.balance).toBe(18536);
    expect(harness.notifications.all()).toMatchObject([{ type: 'wallet.top_up_approved' }]);

    expect(await harness.deliver(harness.event(topUp.reference, 'APPROVED'))).toEqual({ outcome: 'unchanged' });
    expect(harness.wallet.store.movements()).toHaveLength(2);
    expect(harness.notifications.all()).toHaveLength(1);
  });

  it('asks again at 1 h, 6 h and 24 h while the payment is pending', async () => {
    const harness = new PaymentsHarness();
    const topUp = await pendingTopUp(harness);
    harness.gateway.answer(null, harness.answer(topUp.reference, 'PENDING'), null);

    await runAt(harness, topUp.createdAt, 15);
    expect((await harness.topUps.getById(topUp.topUpId))?.nextCheckAt).toEqual(new Date(new Date(topUp.createdAt).getTime() + 60 * MINUTE));
    await runAt(harness, topUp.createdAt, 59);
    await runAt(harness, topUp.createdAt, 60);
    expect((await harness.topUps.getById(topUp.topUpId))?.nextCheckAt).toEqual(new Date(new Date(topUp.createdAt).getTime() + 360 * MINUTE));
    await runAt(harness, topUp.createdAt, 360);

    const stored = await harness.topUps.getById(topUp.topUpId);
    expect(stored).toMatchObject({ status: 'pending', checks: 3 });
    expect(stored?.nextCheckAt).toEqual(new Date(new Date(topUp.createdAt).getTime() + 1440 * MINUTE));
    expect(harness.gateway.queries).toHaveLength(3);
  });

  it('expires a top-up still pending at 48 hours and tells the goalkeeper', async () => {
    const harness = new PaymentsHarness();
    const topUp = await pendingTopUp(harness);

    await runAt(harness, topUp.createdAt, 1440);
    expect(await runAt(harness, topUp.createdAt, 2880)).toBe('1 checked, 0 applied, 1 expired, 0 failed');

    expect(await harness.topUps.getById(topUp.topUpId)).toMatchObject({ status: 'expired', nextCheckAt: null });
    expect(harness.wallet.store.movements()).toEqual([]);
    expect(harness.notifications.all()).toMatchObject([{ type: 'wallet.top_up_failed' }]);
    expect(await runAt(harness, topUp.createdAt, 3000)).toBe('0 checked, 0 applied, 0 expired, 0 failed');
  });

  it('applies a decline found by the check, with a failed notice', async () => {
    const harness = new PaymentsHarness();
    const topUp = await pendingTopUp(harness);
    harness.gateway.answer(harness.answer(topUp.reference, 'DECLINED'));

    expect(await runAt(harness, topUp.createdAt, 15)).toBe('1 checked, 1 applied, 0 expired, 0 failed');
    expect((await harness.topUps.getById(topUp.topUpId))?.status).toBe('declined');
    expect(harness.notifications.all()).toMatchObject([{ type: 'wallet.top_up_failed' }]);
  });

  it('keeps a mismatched answer pending, uncredited, on its schedule', async () => {
    const harness = new PaymentsHarness();
    const topUp = await pendingTopUp(harness);
    harness.gateway.answer(harness.answer(topUp.reference, 'APPROVED', 100));

    await runAt(harness, topUp.createdAt, 15);

    expect(await harness.topUps.getById(topUp.topUpId)).toMatchObject({ status: 'pending', checks: 1 });
    expect(harness.wallet.store.movements()).toEqual([]);
  });

  it('leaves everything as is while the gateway is down, and retries on the next run', async () => {
    const harness = new PaymentsHarness();
    const topUp = await pendingTopUp(harness);
    harness.gateway.available = false;

    expect(await runAt(harness, topUp.createdAt, 15)).toBe('1 checked, 0 applied, 0 expired, 1 failed');
    expect(await harness.topUps.getById(topUp.topUpId)).toMatchObject({ status: 'pending', checks: 0 });

    harness.gateway.available = true;
    harness.gateway.answer(harness.answer(topUp.reference, 'APPROVED'));
    expect(await runAt(harness, topUp.createdAt, 16)).toBe('1 checked, 1 applied, 0 expired, 0 failed');
  });

  it('keeps asking the top-up\'s own gateway and environment after the country\'s settings change', async () => {
    const harness = new PaymentsHarness();
    const topUp = await pendingTopUp(harness);
    harness.settings.seed({ publicConfig: { publicKey: 'pub_prod_new', environment: 'production' } });
    harness.gateway.answer(harness.answer(topUp.reference, 'APPROVED'));

    await runAt(harness, topUp.createdAt, 15);

    expect(harness.gateway.queries).toEqual([{ reference: topUp.reference, environment: 'sandbox' }]);
    expect((await harness.topUps.getById(topUp.topUpId))?.status).toBe('approved');
  });

  it('isolates a failure: the other top-ups are still checked', async () => {
    const harness = new PaymentsHarness();
    harness.goalkeeper('gk-1');
    harness.goalkeeper('gk-2');
    const first = (await harness.start('gk-1')).topUp;
    const second = (await harness.start('gk-2')).topUp;
    // gk-1's wallet can no longer be resolved: its profile moved to a city without a country.
    harness.wallet.profiles.seed(buildGoalkeeperProfile('gk-1', { cityId: 'city-orphan' }));
    harness.gateway.answer(harness.answer(first.reference, 'APPROVED'), harness.answer(second.reference, 'APPROVED'));

    expect(await runAt(harness, first.createdAt, 15)).toBe('2 checked, 1 applied, 0 expired, 1 failed');
    expect((await harness.topUps.getById(first.topUpId))?.status).toBe('pending');
    expect((await harness.topUps.getById(second.topUpId))?.status).toBe('approved');
  });
});
