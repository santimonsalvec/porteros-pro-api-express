import { describe, expect, it } from 'vitest';
import { ReconcileDepositCommand } from '../../../../../src/application/features/deposits/commands/reconcileDeposit/reconcileDepositCommand.js';
import { ReconcileDepositCommandHandler } from '../../../../../src/application/features/deposits/commands/reconcileDeposit/reconcileDepositCommandHandler.js';
import { Deposit, type DepositStatus } from '../../../../../src/domain/deposits/deposit.js';
import { PaymentsHarness } from '../payments/paymentsHarness.js';

// Admin spec 007, US1 (FR-006): "Conciliar ahora" asks the gateway now, through the sweep's own ask.

const STAFF = 'staff-user-1';

async function setup() {
  const harness = new PaymentsHarness();
  harness.goalkeeper();
  const { deposit } = await harness.start();
  harness.clock.set(new Date(new Date(deposit.createdAt).getTime() + 62 * 60_000));
  const handler = new ReconcileDepositCommandHandler({
    operatingBalanceContext: harness.operatingBalance.context,
    store: harness.store,
    notices: harness.noticeDeps,
    logger: harness.logger,
    depositRepository: harness.deposits,
    gateways: harness.gateways,
    secrets: harness.secrets,
    countryLookup: harness.operatingBalance.countries,
    clock: harness.clock,
  });
  const reconcile = (id = deposit.depositId) => handler.handle(new ReconcileDepositCommand(STAFF, id));
  const stored = async () => (await harness.deposits.getById(deposit.depositId))!;
  const setStatus = async (status: DepositStatus) => harness.deposits.put(Deposit.rehydrate({ ...(await stored()).toProps(), status }));
  return { harness, deposit, reconcile, stored, setStatus };
}

describe('ReconcileDepositCommandHandler', () => {
  it('answers not_found for a deposit that does not exist', async () => {
    const { reconcile } = await setup();
    expect(await reconcile('nope')).toEqual({ outcome: 'not_found' });
  });

  it.each(['approved', 'declined', 'voided', 'error'] as const)('does not ask about a %s deposit', async (status) => {
    const { harness, reconcile, setStatus } = await setup();
    await setStatus(status);

    expect(await reconcile()).toMatchObject({ outcome: 'already_final', deposit: { status } });
    expect(harness.gateway.queries).toEqual([]);
  });

  it('answers in_progress while another ask holds the deposit', async () => {
    const { harness, deposit, reconcile } = await setup();
    await harness.deposits.acquireCheckLease(deposit.depositId, harness.clock.now());

    expect(await reconcile()).toEqual({ outcome: 'in_progress' });
    expect(harness.gateway.queries).toEqual([]);
  });

  it('answers credentials_missing without asking, recording or changing anything', async () => {
    const { harness, deposit, reconcile, stored } = await setup();
    harness.secrets.secrets.clear();

    expect(await reconcile()).toEqual({ outcome: 'credentials_missing' });
    expect(harness.gateway.queries).toEqual([]);
    expect(harness.deposits.checkLogs.get(deposit.depositId)).toBeUndefined();
    expect((await stored()).status).toBe('pending');
  });

  it('answers gateway_unavailable when the gateway does not answer, and keeps the try', async () => {
    const { harness, deposit, reconcile, stored } = await setup();
    harness.gateway.available = false;

    expect(await reconcile()).toMatchObject({ outcome: 'gateway_unavailable', deposit: { status: 'pending' } });
    expect(harness.deposits.checkLogs.get(deposit.depositId)).toMatchObject([{ by: 'staff', staffUserId: STAFF, answer: 'UNAVAILABLE' }]);
    expect((await stored()).status).toBe('pending');
    expect(harness.deposits.leases.size).toBe(0);
  });

  it('credits an approval once', async () => {
    const { harness, deposit, reconcile } = await setup();
    harness.gateway.answer(harness.answer(deposit.reference, 'APPROVED'));

    expect(await reconcile()).toMatchObject({ outcome: 'reconciled', answer: 'APPROVED', status: 'approved', deposit: { status: 'approved' } });
    expect(harness.operatingBalance.store.movements().map((movement) => movement.type)).toEqual(['deposit', 'gateway_fee']);
  });

  it('does not credit twice when the confirmation arrived just before', async () => {
    const { harness, deposit, reconcile } = await setup();
    await harness.deliver(harness.event(deposit.reference, 'APPROVED'));
    // The member had the page open while pending: the handler reads the deposit fresh and sees it final.
    expect(await reconcile()).toMatchObject({ outcome: 'already_final', deposit: { status: 'approved' } });
    expect(harness.operatingBalance.store.movements()).toHaveLength(2);
  });

  it('does not credit twice when the confirmation lands between the read and the ask', async () => {
    const { harness, deposit, reconcile } = await setup();
    harness.gateway.answer(harness.answer(deposit.reference, 'APPROVED'));
    const read = harness.deposits.getById.bind(harness.deposits);
    let first = true;
    harness.deposits.getById = async (id: string) => {
      const found = await read(id);
      if (first) {
        first = false;
        await harness.deliver(harness.event(deposit.reference, 'APPROVED'));
      }
      return found;
    };

    expect(await reconcile()).toMatchObject({ outcome: 'reconciled', status: 'approved' });
    expect(harness.operatingBalance.store.movements()).toHaveLength(2);
  });

  it('keeps a pending answer pending', async () => {
    const { harness, deposit, reconcile } = await setup();
    harness.gateway.answer(harness.answer(deposit.reference, 'PENDING'));

    expect(await reconcile()).toMatchObject({ outcome: 'reconciled', answer: 'PENDING', status: 'pending' });
  });

  it('reconciles an expired deposit that the gateway approved late', async () => {
    const { harness, deposit, reconcile, setStatus } = await setup();
    await setStatus('expired');
    harness.gateway.answer(harness.answer(deposit.reference, 'APPROVED'));

    expect(await reconcile()).toMatchObject({ outcome: 'reconciled', status: 'approved' });
  });

  it('logs only ids and the outcome', async () => {
    const { harness, deposit, reconcile } = await setup();
    harness.gateway.answer(harness.answer(deposit.reference, 'PENDING'));

    await reconcile();

    const entry = harness.logger.entries.find((logged) => logged.entry.outcome === 'deposit_reconcile_requested');
    expect(entry?.entry).toEqual({ outcome: 'deposit_reconcile_requested', depositId: deposit.depositId, staffUserId: STAFF, result: 'reconciled', answer: 'PENDING' });
  });

  it('answers credentials_missing when the country is gone or the gateway is not registered', async () => {
    const { harness, deposit, reconcile } = await setup();
    harness.deposits.put(Deposit.rehydrate({ ...(await harness.deposits.getById(deposit.depositId))!.toProps(), countryId: 'country-gone' }));
    expect(await reconcile()).toEqual({ outcome: 'credentials_missing' });

    harness.deposits.put(Deposit.rehydrate({ ...(await harness.deposits.getById(deposit.depositId))!.toProps(), countryId: 'country-co', gateway: 'otra' as never }));
    expect(await reconcile()).toEqual({ outcome: 'credentials_missing' });
  });

  it('lets an unexpected failure through, and frees the hold', async () => {
    const { harness, reconcile } = await setup();
    harness.gateway.findByReference = async () => {
      throw new Error('boom');
    };

    await expect(reconcile()).rejects.toThrow('boom');
    expect(harness.deposits.leases.size).toBe(0);
  });
});
