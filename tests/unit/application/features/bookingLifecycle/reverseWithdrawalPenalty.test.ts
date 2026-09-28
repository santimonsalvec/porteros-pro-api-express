import { describe, expect, it } from 'vitest';
import { OFFERS_NOW } from '../notifications/offerHarness.js';
import { lifecycleHarness } from './lifecycleHarness.js';

const days = (n: number) => n * 86_400_000;

function matchIn(h: ReturnType<typeof lifecycleHarness>, id: string, hoursFromNow: number) {
  const elapsedHours = (h.clock.now().getTime() - new Date(OFFERS_NOW).getTime()) / 3_600_000;
  return h.match(id, elapsedHours + hoursFromNow).bookings[0]!;
}

/** G withdraws late (90 minutes before) from `r1`: suspended 3 days, the 7.000 commission kept. */
async function lateWithdrawal() {
  const h = lifecycleHarness();
  const booking = h.match('r1', 1.5).bookings[0]!;
  await h.acceptAndPay(booking, 'g');
  await h.withdraw(booking.id, 'g');
  const withdrawal = h.store.incidents()[0]!;
  return { ...h, booking, withdrawal };
}

const refunds = (h: ReturnType<typeof lifecycleHarness>) => h.wallet.movements().filter((movement) => movement.type === 'commission_refund');

describe('ReverseWithdrawalPenaltyCommand — US4', () => {
  it('refunds the commission once, as the administrator, keeping the suspension when only the money is asked', async () => {
    const h = await lateWithdrawal();

    const result = await h.reverse('g', h.withdrawal.id, { refund: true }, '  Incapacidad médica ');

    expect(result).toMatchObject({
      outcome: 'reversed',
      withdrawal: { moneyReversal: { by: 'admin-1', reason: 'Incapacidad médica', amount: 7000, currency: 'COP' }, forgiven: true },
    });
    expect(await h.balanceOf('g')).toBe(20000);
    expect(refunds(h)).toEqual([
      expect.objectContaining({
        amount: 7000,
        causeKey: `commission_refund:${h.booking.id}`,
        actor: { kind: 'admin', userId: 'admin-1' },
        cancellation: expect.objectContaining({ by: 'admin', reason: 'Incapacidad médica' }),
      }),
    ]);
    expect((await h.goalkeeperProfileRepository.getByUserId('g'))!.suspendedUntil).not.toBeNull();

    expect(await h.reverse('g', h.withdrawal.id, { refund: true })).toMatchObject({ outcome: 'replayed' });
    expect(refunds(h)).toHaveLength(1);
    expect(h.audit.reversals.map((entry) => entry.outcome)).toEqual(['reversed', 'replayed']);
  });

  it('lifts the suspension immediately, recomputing the end from what is still in force', async () => {
    const h = await lateWithdrawal();
    // A day later, another late withdrawal (a booking taken before the suspension): a later end.
    h.clock.advance(days(1));
    const late = matchIn(h, 'r3', 1);
    await h.acceptAndPay(late, 'g');
    await h.withdraw(late.id, 'g');
    const secondEnd = (await h.goalkeeperProfileRepository.getByUserId('g'))!.suspendedUntil!;

    // Lifting the later one leaves the first one's end.
    const second = h.store.incidents().find((incident) => incident.bookingId === late.id)!;
    const lifted = await h.reverse('g', second.id, { lift: true });

    const firstEnd = h.withdrawal.penalties[0]!.endsAt;
    expect(secondEnd.getTime()).toBeGreaterThan(firstEnd.getTime());
    expect(lifted).toMatchObject({ outcome: 'reversed', suspendedUntil: firstEnd.toISOString() });
    expect((await h.goalkeeperProfileRepository.getByUserId('g'))!.suspendedUntil).toEqual(firstEnd);

    expect(await h.reverse('g', h.withdrawal.id, { lift: true })).toMatchObject({ outcome: 'reversed', suspendedUntil: null });
    expect(await h.eligibility.availableBookingsFor('g', h.clock.now())).not.toMatchObject({ reason: 'suspended' });
  });

  it('refuses without a proper reason or any action, and for another goalkeeper or an unknown withdrawal', async () => {
    const h = await lateWithdrawal();

    expect(await h.reverse('g', h.withdrawal.id, { refund: true }, ' x ')).toMatchObject({ outcome: 'invalid_request', errors: { reason: expect.any(String) } });
    expect(await h.reverse('g', h.withdrawal.id, { refund: true }, 'x'.repeat(501))).toMatchObject({ outcome: 'invalid_request' });
    expect(await h.reverse('g', h.withdrawal.id, {})).toMatchObject({ outcome: 'invalid_request', errors: { body: expect.any(String) } });
    h.goalkeeper('other');
    expect(await h.reverse('other', h.withdrawal.id, { lift: true })).toEqual({ outcome: 'withdrawal_not_found' });
    expect(await h.reverse('g', 'missing', { lift: true })).toEqual({ outcome: 'withdrawal_not_found' });
    expect(await h.reverse('nobody', h.withdrawal.id, { lift: true })).toEqual({ outcome: 'not_a_goalkeeper' });
    expect(refunds(h)).toHaveLength(0);
  });

  it('forgives a reversed withdrawal: it no longer counts toward the weekly limit', async () => {
    const h = lifecycleHarness();
    const withdrawAt = async (id: string) => {
      const booking = matchIn(h, id, 10);
      await h.acceptAndPay(booking, 'g');
      return h.withdraw(booking.id, 'g');
    };
    await withdrawAt('r1');
    h.clock.advance(days(1));
    await withdrawAt('r2');
    const first = h.store.incidents().find((incident) => incident.requestId === 'r1')!;
    await h.reverse('g', first.id, { refund: true });
    h.clock.advance(days(1));

    const third = await withdrawAt('r3');

    expect(third).toMatchObject({ outcome: 'withdrawn', withdrawal: { penalties: [], suspendedUntil: null } });
  });
});
