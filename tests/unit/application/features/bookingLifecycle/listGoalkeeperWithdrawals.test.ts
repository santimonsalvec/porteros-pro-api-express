import { describe, expect, it } from 'vitest';
import { ListGoalkeeperWithdrawalsQuery } from '../../../../../src/application/features/bookingLifecycle/queries/listGoalkeeperWithdrawals/listGoalkeeperWithdrawalsQuery.js';
import { ListGoalkeeperWithdrawalsQueryHandler } from '../../../../../src/application/features/bookingLifecycle/queries/listGoalkeeperWithdrawals/listGoalkeeperWithdrawalsQueryHandler.js';
import { lifecycleHarness } from './lifecycleHarness.js';

const days = (n: number) => n * 86_400_000;

async function withTwoWithdrawals() {
  const h = lifecycleHarness();
  const inTime = h.match('r1', 5).bookings[0]!;
  await h.acceptAndPay(inTime, 'g');
  await h.withdraw(inTime.id, 'g', 'Me salió un viaje');
  h.clock.advance(60_000);
  const late = h.match('r2', 1).bookings[0]!;
  await h.acceptAndPay(late, 'g');
  await h.withdraw(late.id, 'g');
  const handler = new ListGoalkeeperWithdrawalsQueryHandler({ goalkeeperProfileRepository: h.goalkeeperProfileRepository, incidents: h.incidents, clock: h.clock });
  return { ...h, handler, inTime, late };
}

describe('ListGoalkeeperWithdrawalsQuery (feature 018)', () => {
  it('lists the withdrawals newest first, with notice, reason and penalties, and the suspension in force', async () => {
    const h = await withTwoWithdrawals();

    const result = await h.handler.handle(new ListGoalkeeperWithdrawalsQuery('g', 1, 20, 'goalkeeper'));

    const until = new Date(h.clock.now().getTime() + days(3)).toISOString();
    expect(result).toMatchObject({
      outcome: 'ok',
      page: 1,
      pageSize: 20,
      totalItems: 2,
      totalPages: 1,
      suspendedUntil: until,
      items: [
        { bookingId: h.late.id, late: true, reason: null, penalties: [{ kind: 'late', days: 3, endsAt: until, reversal: null }], forgiven: false },
        { bookingId: h.inTime.id, late: false, reason: 'Me salió un viaje', penalties: [], moneyReversal: null, replacementCreated: true },
      ],
    });
  });

  it('pages, and shows the administrator only in the admin view', async () => {
    const h = await withTwoWithdrawals();
    const late = h.store.incidents().find((incident) => incident.bookingId === h.late.id)!;
    await h.store.reverseWithdrawal({
      goalkeeperId: 'g',
      withdrawalId: late.id,
      adminId: 'admin-1',
      refund: false,
      liftSuspension: true,
      reason: 'Incapacidad médica',
      now: h.clock.now(),
      owner: null,
      newId: () => 'x',
    });

    const second = await h.handler.handle(new ListGoalkeeperWithdrawalsQuery('g', 2, 1, 'goalkeeper'));
    expect(second).toMatchObject({ totalItems: 2, totalPages: 2, items: [{ bookingId: h.inTime.id }] });

    const forGoalkeeper = await h.handler.handle(new ListGoalkeeperWithdrawalsQuery('g', 1, 1, 'goalkeeper'));
    const forAdmin = await h.handler.handle(new ListGoalkeeperWithdrawalsQuery('g', 1, 1, 'admin'));
    const reversalOf = (result: typeof forAdmin) => (result.outcome === 'ok' ? result.items[0]!.penalties[0]!.reversal : null);
    expect(reversalOf(forGoalkeeper)).toEqual({ at: h.clock.now().toISOString(), reason: 'Incapacidad médica' });
    expect(reversalOf(forAdmin)).toEqual({ by: 'admin-1', at: h.clock.now().toISOString(), reason: 'Incapacidad médica' });
    expect(forAdmin).toMatchObject({ suspendedUntil: null, items: [{ forgiven: true }] });
  });

  it('answers not_a_goalkeeper, and an empty page for a goalkeeper without withdrawals', async () => {
    const h = lifecycleHarness();
    const handler = new ListGoalkeeperWithdrawalsQueryHandler({ goalkeeperProfileRepository: h.goalkeeperProfileRepository, incidents: h.incidents, clock: h.clock });
    h.goalkeeper('clean');

    expect(await handler.handle(new ListGoalkeeperWithdrawalsQuery('nobody', 1, 20, 'goalkeeper'))).toEqual({ outcome: 'not_a_goalkeeper' });
    expect(await handler.handle(new ListGoalkeeperWithdrawalsQuery('clean', 1, 20, 'goalkeeper'))).toMatchObject({
      outcome: 'ok',
      items: [],
      totalItems: 0,
      totalPages: 0,
      suspendedUntil: null,
    });
  });
});
