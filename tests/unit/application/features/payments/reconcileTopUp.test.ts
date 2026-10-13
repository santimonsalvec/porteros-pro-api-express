import { describe, expect, it } from 'vitest';
import { ReconcileTopUpCommand } from '../../../../../src/application/features/payments/commands/reconcileTopUp/reconcileTopUpCommand.js';
import { ReconcileTopUpCommandHandler } from '../../../../../src/application/features/payments/commands/reconcileTopUp/reconcileTopUpCommandHandler.js';
import { TopUp, type TopUpStatus } from '../../../../../src/domain/payments/topUp.js';
import { PaymentsHarness } from './paymentsHarness.js';

// Admin spec 007, US1 (FR-006): "Conciliar ahora" asks the gateway now, through the sweep's own ask.

const STAFF = 'staff-user-1';

async function setup() {
  const harness = new PaymentsHarness();
  harness.goalkeeper();
  const { topUp } = await harness.start();
  harness.clock.set(new Date(new Date(topUp.createdAt).getTime() + 62 * 60_000));
  const handler = new ReconcileTopUpCommandHandler({
    walletContext: harness.wallet.context,
    store: harness.store,
    notices: harness.noticeDeps,
    logger: harness.logger,
    topUpRepository: harness.topUps,
    gateways: harness.gateways,
    secrets: harness.secrets,
    countryLookup: harness.wallet.countries,
    clock: harness.clock,
  });
  const reconcile = (id = topUp.topUpId) => handler.handle(new ReconcileTopUpCommand(STAFF, id));
  const stored = async () => (await harness.topUps.getById(topUp.topUpId))!;
  const setStatus = async (status: TopUpStatus) => harness.topUps.put(TopUp.rehydrate({ ...(await stored()).toProps(), status }));
  return { harness, topUp, reconcile, stored, setStatus };
}

describe('ReconcileTopUpCommandHandler', () => {
  it('answers not_found for a top-up that does not exist', async () => {
    const { reconcile } = await setup();
    expect(await reconcile('nope')).toEqual({ outcome: 'not_found' });
  });

  it.each(['approved', 'declined', 'voided', 'error'] as const)('does not ask about a %s top-up', async (status) => {
    const { harness, reconcile, setStatus } = await setup();
    await setStatus(status);

    expect(await reconcile()).toMatchObject({ outcome: 'already_final', topUp: { status } });
    expect(harness.gateway.queries).toEqual([]);
  });

  it('answers in_progress while another ask holds the top-up', async () => {
    const { harness, topUp, reconcile } = await setup();
    await harness.topUps.acquireCheckLease(topUp.topUpId, harness.clock.now());

    expect(await reconcile()).toEqual({ outcome: 'in_progress' });
    expect(harness.gateway.queries).toEqual([]);
  });

  it('answers credentials_missing without asking, recording or changing anything', async () => {
    const { harness, topUp, reconcile, stored } = await setup();
    harness.secrets.secrets.clear();

    expect(await reconcile()).toEqual({ outcome: 'credentials_missing' });
    expect(harness.gateway.queries).toEqual([]);
    expect(harness.topUps.checkLogs.get(topUp.topUpId)).toBeUndefined();
    expect((await stored()).status).toBe('pending');
  });

  it('answers gateway_unavailable when the gateway does not answer, and keeps the try', async () => {
    const { harness, topUp, reconcile, stored } = await setup();
    harness.gateway.available = false;

    expect(await reconcile()).toMatchObject({ outcome: 'gateway_unavailable', topUp: { status: 'pending' } });
    expect(harness.topUps.checkLogs.get(topUp.topUpId)).toMatchObject([{ by: 'staff', staffUserId: STAFF, answer: 'UNAVAILABLE' }]);
    expect((await stored()).status).toBe('pending');
    expect(harness.topUps.leases.size).toBe(0);
  });

  it('credits an approval once', async () => {
    const { harness, topUp, reconcile } = await setup();
    harness.gateway.answer(harness.answer(topUp.reference, 'APPROVED'));

    expect(await reconcile()).toMatchObject({ outcome: 'reconciled', answer: 'APPROVED', status: 'approved', topUp: { status: 'approved' } });
    expect(harness.wallet.store.movements().map((movement) => movement.type)).toEqual(['top_up', 'gateway_fee']);
  });

  it('does not credit twice when the confirmation arrived just before', async () => {
    const { harness, topUp, reconcile } = await setup();
    await harness.deliver(harness.event(topUp.reference, 'APPROVED'));
    // The member had the page open while pending: the handler reads the top-up fresh and sees it final.
    expect(await reconcile()).toMatchObject({ outcome: 'already_final', topUp: { status: 'approved' } });
    expect(harness.wallet.store.movements()).toHaveLength(2);
  });

  it('does not credit twice when the confirmation lands between the read and the ask', async () => {
    const { harness, topUp, reconcile } = await setup();
    harness.gateway.answer(harness.answer(topUp.reference, 'APPROVED'));
    const read = harness.topUps.getById.bind(harness.topUps);
    let first = true;
    harness.topUps.getById = async (id: string) => {
      const found = await read(id);
      if (first) {
        first = false;
        await harness.deliver(harness.event(topUp.reference, 'APPROVED'));
      }
      return found;
    };

    expect(await reconcile()).toMatchObject({ outcome: 'reconciled', status: 'approved' });
    expect(harness.wallet.store.movements()).toHaveLength(2);
  });

  it('keeps a pending answer pending', async () => {
    const { harness, topUp, reconcile } = await setup();
    harness.gateway.answer(harness.answer(topUp.reference, 'PENDING'));

    expect(await reconcile()).toMatchObject({ outcome: 'reconciled', answer: 'PENDING', status: 'pending' });
  });

  it('reconciles an expired top-up that the gateway approved late', async () => {
    const { harness, topUp, reconcile, setStatus } = await setup();
    await setStatus('expired');
    harness.gateway.answer(harness.answer(topUp.reference, 'APPROVED'));

    expect(await reconcile()).toMatchObject({ outcome: 'reconciled', status: 'approved' });
  });

  it('logs only ids and the outcome', async () => {
    const { harness, topUp, reconcile } = await setup();
    harness.gateway.answer(harness.answer(topUp.reference, 'PENDING'));

    await reconcile();

    const entry = harness.logger.entries.find((logged) => logged.entry.outcome === 'top_up_reconcile_requested');
    expect(entry?.entry).toEqual({ outcome: 'top_up_reconcile_requested', topUpId: topUp.topUpId, staffUserId: STAFF, result: 'reconciled', answer: 'PENDING' });
  });

  it('answers credentials_missing when the country is gone or the gateway is not registered', async () => {
    const { harness, topUp, reconcile } = await setup();
    harness.topUps.put(TopUp.rehydrate({ ...(await harness.topUps.getById(topUp.topUpId))!.toProps(), countryId: 'country-gone' }));
    expect(await reconcile()).toEqual({ outcome: 'credentials_missing' });

    harness.topUps.put(TopUp.rehydrate({ ...(await harness.topUps.getById(topUp.topUpId))!.toProps(), countryId: 'country-co', gateway: 'otra' as never }));
    expect(await reconcile()).toEqual({ outcome: 'credentials_missing' });
  });

  it('lets an unexpected failure through, and frees the hold', async () => {
    const { harness, reconcile } = await setup();
    harness.gateway.findByReference = async () => {
      throw new Error('boom');
    };

    await expect(reconcile()).rejects.toThrow('boom');
    expect(harness.topUps.leases.size).toBe(0);
  });
});
