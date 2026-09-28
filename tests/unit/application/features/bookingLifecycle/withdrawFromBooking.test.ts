import { describe, expect, it } from 'vitest';
import { NotifyBookingOffersCommand } from '../../../../../src/application/features/notifications/commands/notifyBookingOffers/notifyBookingOffersCommand.js';
import { NotifyBookingOffersCommandHandler } from '../../../../../src/application/features/notifications/commands/notifyBookingOffers/notifyBookingOffersCommandHandler.js';
import type { GoalkeeperWithdrewPayload } from '../../../../../src/domain/events/bookingEvents.js';
import { BookingSettings } from '../../../../../src/domain/pricing/bookingSettings.js';
import { OFFERS_NOW } from '../notifications/offerHarness.js';
import { lifecycleHarness } from './lifecycleHarness.js';

const minutes = (n: number) => n * 60_000;
const days = (n: number) => n * 86_400_000;

/** A match starting `hoursFromNow` after the harness clock's current time (which tests advance). */
function matchIn(h: ReturnType<typeof lifecycleHarness>, id: string, hoursFromNow: number) {
  const elapsedHours = (h.clock.now().getTime() - new Date(OFFERS_NOW).getTime()) / 3_600_000;
  return h.match(id, elapsedHours + hoursFromNow).bookings[0]!;
}

/** A harness where `g` holds the match `r1` (starting `hoursAhead` after now) and `h` is another eligible goalkeeper. */
async function withAssignedMatch(hoursAhead = 3, count: 1 | 2 = 1) {
  const h = lifecycleHarness();
  h.goalkeeper('h');
  await h.phone('h');
  await h.phone('client-a');
  const { bookings } = h.match('r1', hoursAhead, count);
  await h.acceptAndPay(bookings[0]!, 'g');
  const offers = new NotifyBookingOffersCommandHandler({
    bookingRepository: h.bookingRepository,
    eligibility: h.eligibility,
    sender: h.sender,
    clock: h.clock,
    logger: h.silent,
  });
  /** What the consumers do with the relayed events: notices, and the replacement's offers. */
  const deliver = async () => {
    for (const event of h.relayed.splice(0)) {
      if (event.type === 'goalkeeper.withdrew') await h.withdrawalNotices.handle(event);
      if (event.type === 'booking.created') await offers.handle(new NotifyBookingOffersCommand(event.bookingId));
    }
  };
  return { ...h, bookings, booking: bookings[0]!, deliver };
}

describe('WithdrawFromBookingCommand — US1: withdrawal and replacement', () => {
  it('ends the booking without a refund, creates a replacement and records the events', async () => {
    const h = await withAssignedMatch(3);

    const result = await h.withdraw(h.booking.id, 'g', '  Me salió un viaje ');

    expect(result).toMatchObject({
      outcome: 'withdrawn',
      booking: { bookingId: h.booking.id, status: 'goalkeeper_withdrew', client: null },
      withdrawal: { noticeMinutes: 180, late: false, replacementCreated: true, penalties: [], suspendedUntil: null },
    });
    expect(h.current(h.booking.id)).toMatchObject({
      status: 'goalkeeper_withdrew',
      goalkeeperId: 'g',
      endReason: 'goalkeeper_withdrew',
      cancelledBy: 'goalkeeper',
      cancellationNote: 'Me salió un viaje',
    });
    // The commission stays charged: that's the money penalty.
    expect(await h.balanceOf('g')).toBe(13000);
    expect(h.wallet.movements().filter((movement) => movement.type === 'commission_refund')).toHaveLength(0);

    const replacement = h.bookingRepository.all().find((booking) => booking.replacesBookingId === h.booking.id)!;
    expect(replacement).toMatchObject({
      requestId: 'r1',
      status: 'pending_assignment',
      commission: h.booking.commission,
      searchEndsAt: h.booking.searchEndsAt,
      excludedGoalkeeperIds: ['g'],
    });
    expect(replacement.price).toEqual(h.booking.price);
    expect(h.relayed.map((event) => event.type)).toEqual(['goalkeeper.withdrew', 'booking.created']);
    expect(h.relayed[1]).toMatchObject({ bookingId: replacement.id, payload: { replacesBookingId: h.booking.id } });
    expect(h.request('r1').active).toBe(true);
    expect(h.audit.withdrawals).toEqual([{ outcome: 'withdrawn', goalkeeperId: 'g', bookingId: h.booking.id, requestId: 'r1' }]);
  });

  it('offers the replacement to eligible goalkeepers but not to the one who withdrew, and tells the client once', async () => {
    const h = await withAssignedMatch(3);
    h.goalkeeper('g', {}, 20000); // G also qualifies for Bello offers, but withdrew
    await h.phone('g');

    await h.withdraw(h.booking.id, 'g');
    await h.deliver();

    const replacement = h.bookingRepository.all().find((booking) => booking.replacesBookingId === h.booking.id)!;
    expect(h.notifications.all().filter((item) => item.type === 'booking.available').map((item) => [item.userId, item.data.bookingId])).toEqual([
      ['h', replacement.id],
    ]);
    const available = await h.eligibility.availableBookingsFor('g', h.clock.now());
    expect(available).toMatchObject({ kind: 'ok', bookings: [] });
    const clientNotices = h.notifications.all().filter((item) => item.userId === 'client-a');
    expect(clientNotices).toEqual([
      expect.objectContaining({
        type: 'booking.goalkeeper_withdrew',
        title: 'Tu portero se retiró',
        body: expect.stringContaining('Ya estamos buscando otro portero.'),
      }),
    ]);
    expect(h.pushSender.calls.filter((call) => call.userId === 'client-a')).toHaveLength(1);
  });

  it('creates no replacement once the search is over, tells the client, and closes the request', async () => {
    const h = await withAssignedMatch(1);
    h.clock.advance(minutes(40)); // 20 minutes before the start; the search ended at start − 30

    const result = await h.withdraw(h.booking.id, 'g');
    await h.deliver();

    expect(result).toMatchObject({ outcome: 'withdrawn', withdrawal: { noticeMinutes: 20, late: true, replacementCreated: false } });
    expect(h.bookingRepository.all().filter((booking) => booking.requestId === 'r1')).toHaveLength(1);
    expect(h.request('r1').active).toBe(false);
    expect(h.notifications.all().find((item) => item.userId === 'client-a')?.body).toContain('No alcanzamos a buscar otro portero.');
  });

  it('is idempotent: a repeat changes nothing', async () => {
    const h = await withAssignedMatch(3);
    const first = await h.withdraw(h.booking.id, 'g');

    const again = await h.withdraw(h.booking.id, 'g');

    expect(again).toEqual({ ...first, outcome: 'replayed' });
    expect(h.relayed).toHaveLength(2);
    expect(h.store.incidents()).toHaveLength(1);
    expect(h.bookingRepository.all().filter((booking) => booking.requestId === 'r1')).toHaveLength(2);
  });

  it('refuses what the goalkeeper cannot withdraw from, changing nothing', async () => {
    const h = await withAssignedMatch(3, 2);
    const pending = h.bookings[1]!;

    expect(await h.withdraw(h.booking.id, 'someone-else')).toEqual({ outcome: 'not_a_goalkeeper' });
    h.goalkeeper('other');
    expect(await h.withdraw(h.booking.id, 'other')).toEqual({ outcome: 'booking_not_found' });
    expect(await h.withdraw('missing', 'g')).toEqual({ outcome: 'booking_not_found' });
    expect(await h.withdraw(pending.id, 'g')).toEqual({ outcome: 'booking_not_found' });
    expect(await h.withdraw(h.booking.id, 'g', 'x'.repeat(201))).toEqual({ outcome: 'invalid_reason' });

    h.clock.advance(minutes(180));
    expect(await h.withdraw(h.booking.id, 'g')).toEqual({ outcome: 'match_started', startsAt: h.booking.startsAt.toISOString() });
    expect(h.current(h.booking.id).status).toBe('assigned');
    expect(h.store.incidents()).toHaveLength(0);
  });

  it('refuses a booking the client already cancelled: they refunded it, so there is no penalty', async () => {
    const h = await withAssignedMatch(3);
    await h.cancel('r1', h.booking.id);

    expect(await h.withdraw(h.booking.id, 'g')).toEqual({ outcome: 'not_withdrawable', status: 'cancelled' });
    expect(h.store.incidents()).toHaveLength(0);
    expect(await h.balanceOf('g')).toBe(20000);
  });

  it('once withdrawn, the client can no longer cancel that booking', async () => {
    const h = await withAssignedMatch(3);
    await h.withdraw(h.booking.id, 'g');

    expect(await h.cancel('r1', h.booking.id)).toEqual({ outcome: 'not_cancellable', status: 'goalkeeper_withdrew' });
    expect(h.wallet.movements().filter((movement) => movement.type === 'commission_refund')).toHaveLength(0);
  });

  it('resolves a simultaneous withdrawal and client cancellation to exactly one outcome', async () => {
    const h = await withAssignedMatch(3);

    const [withdrawal, cancellation] = await Promise.all([h.withdraw(h.booking.id, 'g'), h.cancel('r1', h.booking.id)]);

    const refunds = h.wallet.movements().filter((movement) => movement.type === 'commission_refund').length;
    const withdrawals = h.store.incidents().length;
    if (withdrawal.outcome === 'withdrawn') {
      expect(cancellation).toMatchObject({ outcome: 'not_cancellable' });
      expect([refunds, withdrawals]).toEqual([0, 1]);
    } else {
      expect(withdrawal).toEqual({ outcome: 'not_withdrawable', status: 'cancelled' });
      expect(cancellation).toMatchObject({ outcome: 'cancelled' });
      expect([refunds, withdrawals]).toEqual([1, 0]);
    }
  });
});

describe('WithdrawFromBookingCommand — US2: penalties and suspensions', () => {
  it('suspends a late withdrawal for 3 days, with the same effect as any suspension, and tells the goalkeeper', async () => {
    const h = await withAssignedMatch(1.5);
    await h.phone('g');

    const result = await h.withdraw(h.booking.id, 'g');
    await h.deliver();

    const until = new Date(h.clock.now().getTime() + days(3));
    expect(result).toMatchObject({
      outcome: 'withdrawn',
      withdrawal: { noticeMinutes: 90, late: true, penalties: [{ kind: 'late', days: 3, endsAt: until.toISOString() }], suspendedUntil: until.toISOString() },
    });
    expect((await h.goalkeeperProfileRepository.getByUserId('g'))!.suspendedUntil).toEqual(until);
    expect(await h.eligibility.availableBookingsFor('g', h.clock.now())).toMatchObject({ kind: 'unavailable', reason: 'suspended', suspendedUntil: until });
    const notices = h.notifications.all().filter((item) => item.userId === 'g' && item.type === 'goalkeeper.suspended');
    expect(notices).toHaveLength(1);
    expect(notices[0]!.body).toContain('Quedaste suspendido hasta el');
    expect(notices[0]!.data.suspendedUntil).toBe(until.toISOString());
  });

  it('does not suspend a withdrawal with exactly the threshold of notice, and sends no suspension notice', async () => {
    const h = await withAssignedMatch(2);

    const result = await h.withdraw(h.booking.id, 'g');
    await h.deliver();

    expect(result).toMatchObject({ withdrawal: { noticeMinutes: 120, late: false, penalties: [], suspendedUntil: null } });
    expect(h.notifications.all().filter((item) => item.type === 'goalkeeper.suspended')).toHaveLength(0);
    const event = h.store.incidents()[0]!;
    expect(event.penalties).toEqual([]);
  });

  it('suspends the 3rd withdrawal within 7 days for 7 days, never adding the suspensions up', async () => {
    const h = lifecycleHarness();
    const take = async (id: string, hoursAhead: number) => {
      const booking = matchIn(h, id, hoursAhead);
      await h.acceptAndPay(booking, 'g');
      return booking;
    };

    const first = await take('r1', 10);
    expect(await h.withdraw(first.id, 'g')).toMatchObject({ withdrawal: { penalties: [] } });
    h.clock.advance(days(3));
    const second = await take('r2', 10);
    expect(await h.withdraw(second.id, 'g')).toMatchObject({ withdrawal: { penalties: [] } });
    h.clock.advance(days(3));
    // The 3rd within 7 days, and late: both penalties, one end (the later).
    const third = await take('r3', 1);
    const result = await h.withdraw(third.id, 'g');

    const in7 = new Date(h.clock.now().getTime() + days(7)).toISOString();
    expect(result).toMatchObject({
      withdrawal: { late: true, penalties: [{ kind: 'late', days: 3 }, { kind: 'weekly_limit', days: 7, endsAt: in7 }], suspendedUntil: in7 },
    });
  });

  it('counts only the withdrawals of the last 7 days', async () => {
    const h = lifecycleHarness();
    for (const [id, gapDays] of [['r1', 0], ['r2', 4], ['r3', 4]] as const) {
      h.clock.advance(days(gapDays));
      const booking = matchIn(h, id, 10);
      await h.acceptAndPay(booking, 'g');
      expect(await h.withdraw(booking.id, 'g')).toMatchObject({ outcome: 'withdrawn' });
    }

    // The 1st is 8 days before the 3rd: only 2 fall in the window.
    expect(h.store.incidents()).toHaveLength(3);
    expect(h.store.incidents().flatMap((incident) => incident.penalties)).toEqual([]);
  });

  it('keeps the later end when a withdrawal happens while already suspended', async () => {
    const h = lifecycleHarness();
    const first = h.match('r1', 1).bookings[0]!;
    await h.acceptAndPay(first, 'g');
    await h.withdraw(first.id, 'g');
    const firstEnd = (await h.goalkeeperProfileRepository.getByUserId('g'))!.suspendedUntil!;
    h.clock.advance(days(1));
    const second = matchIn(h, 'r2', 10);
    h.assign(second, 'g'); // taken before the suspension, still held

    await h.withdraw(second.id, 'g');

    expect((await h.goalkeeperProfileRepository.getByUserId('g'))!.suspendedUntil).toEqual(firstEnd);
  });

  it("uses the country's penalty values, and the defaults with a warning when there are none", async () => {
    const h = await withAssignedMatch(1.5);
    h.bookingSettingsRepository.seed(new BookingSettings({ id: 's-co', scope: 'country', refId: 'country-co', goalkeeperPenalties: { lateNoticeMinutes: 60 } }));

    expect(await h.withdraw(h.booking.id, 'g')).toMatchObject({ withdrawal: { late: false, penalties: [] } });
    expect(h.warnings).toEqual([expect.objectContaining({ outcome: 'penalty_config_defaulted', defaulted: expect.not.arrayContaining(['lateNoticeMinutes']) })]);

    const other = await withAssignedMatch(1.5);
    expect(await other.withdraw(other.booking.id, 'g')).toMatchObject({ withdrawal: { late: true } });
    expect(other.warnings).toHaveLength(1);
  });

  it('puts the suspension end and the penalties in the withdrawal event', async () => {
    const h = await withAssignedMatch(1.5);
    await h.withdraw(h.booking.id, 'g');

    const payload = h.relayed[0]!.payload as GoalkeeperWithdrewPayload;
    const until = new Date(h.clock.now().getTime() + days(3));
    expect(payload).toMatchObject({ goalkeeperId: 'g', late: true, noticeMinutes: 90, suspendedUntil: until, penalties: [{ kind: 'late', days: 3, endsAt: until }] });
  });

  it("sees the goalkeeper's earlier withdrawal when two of theirs run at once", async () => {
    const h = lifecycleHarness();
    h.bookingSettingsRepository.seed(new BookingSettings({ id: 's-co', scope: 'country', refId: 'country-co', goalkeeperPenalties: { weeklyLimit: 2 } }));
    const a = h.match('r1', 10).bookings[0]!;
    const b = h.match('r2', 10).bookings[0]!;
    await h.acceptAndPay(a, 'g');
    await h.acceptAndPay(b, 'g');

    await Promise.all([h.withdraw(a.id, 'g'), h.withdraw(b.id, 'g')]);

    expect(h.store.incidents().flatMap((incident) => incident.penalties.map((penalty) => penalty.kind))).toEqual(['weekly_limit']);
  });
});
