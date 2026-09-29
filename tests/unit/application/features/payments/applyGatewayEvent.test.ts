import { describe, expect, it } from 'vitest';
import { TopUp } from '../../../../../src/domain/payments/topUp.js';
import { PaymentsHarness } from './paymentsHarness.js';

async function startedTopUp(harness: PaymentsHarness, amount = 20000) {
  harness.goalkeeper();
  const { topUp } = await harness.start('gk-1', amount);
  return topUp;
}

function movementsOf(harness: PaymentsHarness) {
  return harness.wallet.store.movements().map((movement) => ({ type: movement.type, amount: movement.amount, causeKey: movement.causeKey }));
}

describe('ApplyGatewayEventCommandHandler', () => {
  it('credits an approval once: the gross amount and the fee, with one notice', async () => {
    const harness = new PaymentsHarness();
    const topUp = await startedTopUp(harness);

    const result = await harness.deliver(harness.event(topUp.reference, 'APPROVED'));

    expect(result).toEqual({ outcome: 'applied' });
    expect(movementsOf(harness)).toEqual([
      { type: 'top_up', amount: 20000, causeKey: `top_up:${topUp.topUpId}` },
      { type: 'gateway_fee', amount: -1464, causeKey: `gateway_fee:${topUp.topUpId}` },
    ]);
    expect((await harness.wallet.store.findByGoalkeeperId('gk-1'))?.balance).toBe(18536);
    expect(await harness.topUps.getById(topUp.topUpId)).toMatchObject({
      status: 'approved',
      gatewayTransactionId: `tx-${topUp.reference}`,
      finalizedAt: harness.clock.now(),
      nextCheckAt: null,
    });
    expect(harness.notifications.all()).toMatchObject([
      { userId: 'gk-1', type: 'wallet.top_up_approved', body: 'Recarga aprobada: +18.536 COP. Tu saldo es 18.536 COP.' },
    ]);
  });

  it('changes nothing on a repeat of the same event', async () => {
    const harness = new PaymentsHarness();
    const topUp = await startedTopUp(harness);
    const event = harness.event(topUp.reference, 'APPROVED');

    await harness.deliver(event);
    const repeat = await harness.deliver(event);

    expect(repeat).toEqual({ outcome: 'unchanged' });
    expect(harness.wallet.store.movements()).toHaveLength(2);
    expect(harness.notifications.all()).toHaveLength(1);
  });

  it.each([
    ['DECLINED', 'declined'],
    ['VOIDED', 'voided'],
    ['ERROR', 'error'],
  ])('records %s without crediting, and tells the goalkeeper once', async (gatewayStatus, status) => {
    const harness = new PaymentsHarness();
    const topUp = await startedTopUp(harness);

    const result = await harness.deliver(harness.event(topUp.reference, gatewayStatus));
    await harness.deliver(harness.event(topUp.reference, gatewayStatus));

    expect(result).toEqual({ outcome: 'applied' });
    expect((await harness.topUps.getById(topUp.topUpId))?.status).toBe(status);
    expect(harness.wallet.store.movements()).toEqual([]);
    expect(harness.notifications.all()).toMatchObject([
      { type: 'wallet.top_up_failed', body: 'Tu recarga de 20.000 COP no se completó. Puedes intentar con otro medio de pago.' },
    ]);
  });

  it('ignores a pending status', async () => {
    const harness = new PaymentsHarness();
    const topUp = await startedTopUp(harness);

    expect(await harness.deliver(harness.event(topUp.reference, 'PENDING'))).toEqual({ outcome: 'ignored' });
    expect((await harness.topUps.getById(topUp.topUpId))?.status).toBe('pending');
  });

  it('rejects an event with a bad signature and changes nothing', async () => {
    const harness = new PaymentsHarness();
    const topUp = await startedTopUp(harness);

    const forged = await harness.deliver(harness.event(topUp.reference, 'APPROVED', { secret: 'test_events_guess' }));
    const tampered = harness.event(topUp.reference, 'DECLINED');
    tampered.data.transaction.status = 'APPROVED';

    expect(forged).toEqual({ outcome: 'rejected' });
    expect(await harness.deliver(tampered)).toEqual({ outcome: 'rejected' });
    expect((await harness.topUps.getById(topUp.topUpId))?.status).toBe('pending');
    expect(harness.wallet.store.movements()).toEqual([]);
    expect(harness.logger.entries).toContainEqual(expect.objectContaining({ level: 'warn', entry: expect.objectContaining({ outcome: 'top_up_event_rejected' }) }));
  });

  it('ignores an unknown reference, an unreadable body and an unknown gateway', async () => {
    const harness = new PaymentsHarness();
    await startedTopUp(harness);

    expect(await harness.deliver(harness.event('PPR-unknown', 'APPROVED'))).toEqual({ outcome: 'ignored' });
    expect(await harness.deliver({ hello: 'world' })).toEqual({ outcome: 'ignored' });
    expect(await harness.deliver(harness.event('PPR-unknown', 'APPROVED'), 'stripe')).toEqual({ outcome: 'ignored' });
  });

  it.each([
    ['another amount', { amountInCents: 100000 }],
    ['another currency', { currency: 'USD' }],
  ])('never credits a genuine approval for %s', async (_label, overrides) => {
    const harness = new PaymentsHarness();
    const topUp = await startedTopUp(harness);

    expect(await harness.deliver(harness.event(topUp.reference, 'APPROVED', overrides))).toEqual({ outcome: 'mismatch' });
    expect(harness.wallet.store.movements()).toEqual([]);
    expect((await harness.topUps.getById(topUp.topUpId))?.status).toBe('pending');
    expect(harness.logger.entries).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        entry: expect.objectContaining({ outcome: 'top_up_mismatch', reference: topUp.reference, expected: { amountInCents: 2000000, currency: 'COP' } }),
      }),
    );
  });

  it('covers a debt: −30 000 plus a 20 000 top-up leaves −11 464, and the fee is never refused', async () => {
    const harness = new PaymentsHarness();
    const topUp = await startedTopUp(harness);
    await harness.wallet.ledger.applyPenalty(harness.wallet.owner('gk-1'), { penaltyEventId: 'p-1', amount: 30000 });

    expect(await harness.deliver(harness.event(topUp.reference, 'APPROVED'))).toEqual({ outcome: 'applied' });
    expect((await harness.wallet.store.findByGoalkeeperId('gk-1'))?.balance).toBe(-11464);
    expect(harness.notifications.all()[0]?.body).toBe('Recarga aprobada: +18.536 COP. Tu saldo es -11.464 COP.');
  });

  it('credits a late approval of an expired top-up', async () => {
    const harness = new PaymentsHarness();
    const started = await startedTopUp(harness);
    const stored = (await harness.topUps.getById(started.topUpId))!;
    harness.topUps.put(TopUp.rehydrate({ ...stored.toProps(), status: 'expired', nextCheckAt: null }));

    expect(await harness.deliver(harness.event(started.reference, 'APPROVED'))).toEqual({ outcome: 'applied' });
    expect((await harness.wallet.store.findByGoalkeeperId('gk-1'))?.balance).toBe(18536);
  });

  it('never changes an approved top-up afterwards', async () => {
    const harness = new PaymentsHarness();
    const topUp = await startedTopUp(harness);
    await harness.deliver(harness.event(topUp.reference, 'APPROVED'));

    expect(await harness.deliver(harness.event(topUp.reference, 'DECLINED'))).toEqual({ outcome: 'unchanged' });
    expect((await harness.topUps.getById(topUp.topUpId))?.status).toBe('approved');
    expect(harness.notifications.all()).toHaveLength(1);
  });

  it('answers error when its country lost the secrets, so the gateway retries', async () => {
    const harness = new PaymentsHarness();
    const topUp = await startedTopUp(harness);
    harness.secrets.secrets.clear();

    expect(await harness.deliver(harness.event(topUp.reference, 'APPROVED'))).toEqual({ outcome: 'error' });
  });
});
