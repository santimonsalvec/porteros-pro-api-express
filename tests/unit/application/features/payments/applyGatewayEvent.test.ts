import { describe, expect, it } from 'vitest';
import { Deposit } from '../../../../../src/domain/deposits/deposit.js';
import { PaymentsHarness } from './paymentsHarness.js';

async function startedDeposit(harness: PaymentsHarness, amount = 20000) {
  harness.goalkeeper();
  const { deposit } = await harness.start('gk-1', amount);
  return deposit;
}

function movementsOf(harness: PaymentsHarness) {
  return harness.operatingBalance.store.movements().map((movement) => ({ type: movement.type, amount: movement.amount, causeKey: movement.causeKey }));
}

describe('ApplyGatewayEventCommandHandler', () => {
  it('credits an approval once: the gross amount and the fee, with one notice', async () => {
    const harness = new PaymentsHarness();
    const deposit = await startedDeposit(harness);

    const result = await harness.deliver(harness.event(deposit.reference, 'APPROVED'));

    expect(result).toEqual({ outcome: 'applied' });
    expect(movementsOf(harness)).toEqual([
      { type: 'deposit', amount: 20000, causeKey: `deposit:${deposit.depositId}` },
      { type: 'gateway_fee', amount: -1464, causeKey: `gateway_fee:${deposit.depositId}` },
    ]);
    expect((await harness.operatingBalance.store.findByGoalkeeperId('gk-1'))?.balance).toBe(18536);
    expect(await harness.deposits.getById(deposit.depositId)).toMatchObject({
      status: 'approved',
      gatewayTransactionId: `tx-${deposit.reference}`,
      finalizedAt: harness.clock.now(),
      nextCheckAt: null,
    });
    expect(harness.notifications.all()).toMatchObject([
      { userId: 'gk-1', type: 'operating_balance.deposit_approved', body: 'Depósito aprobado: +18.536 COP. Tu saldo operativo es 18.536 COP.' },
    ]);
  });

  it('changes nothing on a repeat of the same event', async () => {
    const harness = new PaymentsHarness();
    const deposit = await startedDeposit(harness);
    const event = harness.event(deposit.reference, 'APPROVED');

    await harness.deliver(event);
    const repeat = await harness.deliver(event);

    expect(repeat).toEqual({ outcome: 'unchanged' });
    expect(harness.operatingBalance.store.movements()).toHaveLength(2);
    expect(harness.notifications.all()).toHaveLength(1);
  });

  it.each([
    ['DECLINED', 'declined'],
    ['VOIDED', 'voided'],
    ['ERROR', 'error'],
  ])('records %s without crediting, and tells the goalkeeper once', async (gatewayStatus, status) => {
    const harness = new PaymentsHarness();
    const deposit = await startedDeposit(harness);

    const result = await harness.deliver(harness.event(deposit.reference, gatewayStatus));
    await harness.deliver(harness.event(deposit.reference, gatewayStatus));

    expect(result).toEqual({ outcome: 'applied' });
    expect((await harness.deposits.getById(deposit.depositId))?.status).toBe(status);
    expect(harness.operatingBalance.store.movements()).toEqual([]);
    expect(harness.notifications.all()).toMatchObject([
      { type: 'operating_balance.deposit_failed', body: 'Tu depósito de 20.000 COP no se completó. Puedes intentar con otro medio de pago.' },
    ]);
  });

  it('ignores a pending status', async () => {
    const harness = new PaymentsHarness();
    const deposit = await startedDeposit(harness);

    expect(await harness.deliver(harness.event(deposit.reference, 'PENDING'))).toEqual({ outcome: 'ignored' });
    expect((await harness.deposits.getById(deposit.depositId))?.status).toBe('pending');
  });

  it('rejects an event with a bad signature and changes nothing', async () => {
    const harness = new PaymentsHarness();
    const deposit = await startedDeposit(harness);

    const forged = await harness.deliver(harness.event(deposit.reference, 'APPROVED', { secret: 'test_events_guess' }));
    const tampered = harness.event(deposit.reference, 'DECLINED');
    tampered.data.transaction.status = 'APPROVED';

    expect(forged).toEqual({ outcome: 'rejected' });
    expect(await harness.deliver(tampered)).toEqual({ outcome: 'rejected' });
    expect((await harness.deposits.getById(deposit.depositId))?.status).toBe('pending');
    expect(harness.operatingBalance.store.movements()).toEqual([]);
    expect(harness.logger.entries).toContainEqual(expect.objectContaining({ level: 'warn', entry: expect.objectContaining({ outcome: 'deposit_event_rejected' }) }));
  });

  it('ignores an unknown reference, an unreadable body and an unknown gateway', async () => {
    const harness = new PaymentsHarness();
    await startedDeposit(harness);

    expect(await harness.deliver(harness.event('PPR-unknown', 'APPROVED'))).toEqual({ outcome: 'ignored' });
    expect(await harness.deliver({ hello: 'world' })).toEqual({ outcome: 'ignored' });
    expect(await harness.deliver(harness.event('PPR-unknown', 'APPROVED'), 'stripe')).toEqual({ outcome: 'ignored' });
  });

  it.each([
    ['another amount', { amountInCents: 100000 }],
    ['another currency', { currency: 'USD' }],
  ])('never credits a genuine approval for %s', async (_label, overrides) => {
    const harness = new PaymentsHarness();
    const deposit = await startedDeposit(harness);

    expect(await harness.deliver(harness.event(deposit.reference, 'APPROVED', overrides))).toEqual({ outcome: 'mismatch' });
    expect(harness.operatingBalance.store.movements()).toEqual([]);
    expect((await harness.deposits.getById(deposit.depositId))?.status).toBe('pending');
    expect(harness.logger.entries).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        entry: expect.objectContaining({ outcome: 'deposit_mismatch', reference: deposit.reference, expected: { amountInCents: 2000000, currency: 'COP' } }),
      }),
    );
  });

  it('covers a debt: −30 000 plus a 20 000 deposit leaves −11 464, and the fee is never refused', async () => {
    const harness = new PaymentsHarness();
    const deposit = await startedDeposit(harness);
    await harness.operatingBalance.ledger.applyPenalty(harness.operatingBalance.owner('gk-1'), { penaltyEventId: 'p-1', amount: 30000 });

    expect(await harness.deliver(harness.event(deposit.reference, 'APPROVED'))).toEqual({ outcome: 'applied' });
    expect((await harness.operatingBalance.store.findByGoalkeeperId('gk-1'))?.balance).toBe(-11464);
    expect(harness.notifications.all()[0]?.body).toBe('Depósito aprobado: +18.536 COP. Tu saldo operativo es -11.464 COP.');
  });

  it('credits a late approval of an expired deposit', async () => {
    const harness = new PaymentsHarness();
    const started = await startedDeposit(harness);
    const stored = (await harness.deposits.getById(started.depositId))!;
    harness.deposits.put(Deposit.rehydrate({ ...stored.toProps(), status: 'expired', nextCheckAt: null }));

    expect(await harness.deliver(harness.event(started.reference, 'APPROVED'))).toEqual({ outcome: 'applied' });
    expect((await harness.operatingBalance.store.findByGoalkeeperId('gk-1'))?.balance).toBe(18536);
  });

  it('never changes an approved deposit afterwards', async () => {
    const harness = new PaymentsHarness();
    const deposit = await startedDeposit(harness);
    await harness.deliver(harness.event(deposit.reference, 'APPROVED'));

    expect(await harness.deliver(harness.event(deposit.reference, 'DECLINED'))).toEqual({ outcome: 'unchanged' });
    expect((await harness.deposits.getById(deposit.depositId))?.status).toBe('approved');
    expect(harness.notifications.all()).toHaveLength(1);
  });

  it('answers error when its country lost the secrets, so the gateway retries', async () => {
    const harness = new PaymentsHarness();
    const deposit = await startedDeposit(harness);
    harness.secrets.secrets.clear();

    expect(await harness.deliver(harness.event(deposit.reference, 'APPROVED'))).toEqual({ outcome: 'error' });
  });
});
