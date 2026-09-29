import { describe, expect, it } from 'vitest';
import { BookingSettings } from '../../../../../src/domain/pricing/bookingSettings.js';
import { Region } from '../../../../../src/domain/locations/region.js';
import { closeHarness } from './closeHarness.js';

const days = (n: number) => n * 86_400_000;

describe('no-shows — US3 (feature 021)', () => {
  it('records a no-show at end + 60 without a check-in or rating, once, with a 3-day suspension and a notice', async () => {
    const h = await closeHarness();
    await h.phone('g');
    await h.close();
    h.at(59);
    await h.settle();
    expect(h.current(h.booking.id).attendance).toBeNull();

    h.at(60);
    expect(await h.settle()).toBe('1 no-shows, 0 attended, 0 failed');
    expect(await h.settle()).toBe('0 no-shows, 0 attended, 0 failed');

    const booking = h.current(h.booking.id);
    expect(booking).toMatchObject({ attendance: 'no_show', noShowAt: h.clock.now() });
    const [incident] = h.store.incidents();
    expect(incident).toMatchObject({ kind: 'no_show', bookingId: h.booking.id, late: true, noticeMinutes: 0, penalties: [{ kind: 'late', days: 3 }] });
    expect((await h.goalkeeperProfileRepository.getByUserId('g'))!.suspendedUntil).toEqual(new Date(h.clock.now().getTime() + days(3)));
    for (const event of h.relayed.filter((e) => e.type === 'goalkeeper.no_show')) await h.noShowNotices.handle(event);
    expect(h.notifications.all().filter((item) => item.type === 'goalkeeper.no_show' && item.userId === 'g')).toHaveLength(1);
  });

  it('never for a checked-in booking, nor after the client said "yes"', async () => {
    const h = await closeHarness();
    await h.checkInNow();
    await h.close();
    h.at(90);
    await h.settle();
    expect(h.current(h.booking.id).attendance).toBe('attended');

    const yes = await closeHarness();
    await yes.close();
    yes.at(30);
    await yes.rate(yes.booking.id, 'client-a', true);
    yes.at(60);
    await yes.settle();
    expect(yes.current(yes.booking.id).attendance).toBe('attended');
    expect(yes.store.incidents()).toHaveLength(0);
  });

  it('records the no-show at once on the client’s "no" without a check-in (clarification 1)', async () => {
    const h = await closeHarness();
    await h.close();
    h.at(10);

    await h.rate(h.booking.id, 'client-a', false, 1, 'Nunca llegó');

    expect(h.current(h.booking.id).attendance).toBe('no_show');
    expect(h.store.incidents()).toMatchObject([{ kind: 'no_show' }]);
    expect(h.relayed.map((e) => e.type)).toContain('goalkeeper.no_show');
    h.at(60);
    expect(await h.settle()).toBe('0 no-shows, 0 attended, 0 failed');
  });

  it('counts toward the weekly limit, and an admin can reverse it', async () => {
    const h = await closeHarness();
    for (const id of ['w1', 'w2']) {
      h.clock.set(new Date(h.booking.startsAt.getTime() - days(1)));
      const other = h.match(id, 30).bookings[0]!;
      await h.acceptAndPay(other, 'g');
      await h.withdraw(other.id, 'g');
    }
    await h.close();
    h.at(60);
    await h.settle();

    const noShow = h.store.incidents().find((incident) => incident.kind === 'no_show')!;
    expect(noShow.penalties.map((penalty) => penalty.kind)).toEqual(['late', 'weekly_limit']);
    expect(await h.reverse('g', noShow.id, { lift: true })).toMatchObject({ outcome: 'reversed', withdrawal: { kind: 'no_show', forgiven: true } });
  });

  it("uses the country's grace period", async () => {
    const h = await closeHarness();
    h.regionRepository.seed(new Region({ id: 'region-antioquia', name: 'Antioquia', countryId: 'country-co' }));
    h.bookingSettingsRepository.seed(new BookingSettings({ id: 's-co', scope: 'country', refId: 'country-co', noShowGraceMinutes: 30 }));
    await h.close();
    h.at(30);

    expect(await h.settle()).toBe('1 no-shows, 0 attended, 0 failed');
  });

  it('settles exactly one outcome when a late "yes" races the sweep', async () => {
    const h = await closeHarness();
    await h.close();
    h.at(60);

    const [rating] = await Promise.all([h.rate(h.booking.id, 'client-a', true), h.settle()]);

    expect(rating.outcome).toBe('rated');
    const booking = h.current(h.booking.id);
    if (booking.attendance === 'no_show') {
      expect(h.store.cases.all().map((item) => item.type)).toEqual(['late_attendance_claim']);
    } else {
      expect(booking.attendance).toBe('attended');
      expect(h.store.incidents()).toHaveLength(0);
    }
  });
});
