import { describe, expect, it } from 'vitest';
import { BookingSettings } from '../../../../../src/domain/pricing/bookingSettings.js';
import { Region } from '../../../../../src/domain/locations/region.js';
import { lifecycleHarness } from './lifecycleHarness.js';

const minutes = (n: number) => n * 60_000;

/** G holds a Bello match starting in 1 hour; the window opens at start − 30 (30 minutes from now). */
async function setUp() {
  const h = lifecycleHarness();
  const { bookings } = h.match('r1', 1, 1);
  await h.acceptAndPay(bookings[0]!, 'g');
  const booking = h.current(bookings[0]!.id);
  const pitch = h.request('r1').match;
  return { ...h, booking, pitch, start: booking.startsAt };
}
const at = (h: Awaited<ReturnType<typeof setUp>>, minutesFromStart: number) => h.clock.set(new Date(h.start.getTime() + minutes(minutesFromStart)));

describe('CheckInToBookingCommand — US1: the goalkeeper checks in with a photo', () => {
  it('records the check-in with the photo, the location and the distance, and one event', async () => {
    const h = await setUp();
    at(h, -10);
    const photo = h.photo('g');

    const result = await h.checkIn(h.booking.id, 'g', photo, { latitude: h.pitch.latitude + 0.001, longitude: h.pitch.longitude, accuracyMeters: 8 });

    expect(result).toMatchObject({ outcome: 'checked_in', booking: { bookingId: h.booking.id, checkIn: { photoUrl: `https://img.example/${photo}.jpg` } } });
    const checkIn = h.current(h.booking.id).checkIn!;
    expect(checkIn).toMatchObject({ at: h.clock.now(), imageId: photo, location: { accuracyMeters: 8 } });
    expect(checkIn.distanceMeters).toBeGreaterThan(100);
    expect(checkIn.distanceMeters).toBeLessThan(120);
    expect(h.relayed.map((event) => event.type)).toEqual(['goalkeeper.checked_in']);
    expect(h.audit.checkIns.map((entry) => entry.outcome)).toEqual(['checked_in']);
  });

  it('accepts a check-in without a location, or far from the pitch', async () => {
    const h = await setUp();
    at(h, -5);
    expect(await h.checkIn(h.booking.id, 'g', h.photo('g'))).toMatchObject({ outcome: 'checked_in', booking: { checkIn: { distanceMeters: null } } });
    expect(h.current(h.booking.id).checkIn).toMatchObject({ location: null, distanceMeters: null });

    const far = await setUp();
    at(far, -5);
    const result = await far.checkIn(far.booking.id, 'g', far.photo('g'), { latitude: far.pitch.latitude + 0.05, longitude: far.pitch.longitude });
    expect(result.outcome).toBe('checked_in');
    expect(far.current(far.booking.id).checkIn!.distanceMeters).toBeGreaterThan(5000);
  });

  it('answers a repeat with the recorded check-in, even after the window closed', async () => {
    const h = await setUp();
    at(h, -5);
    const first = await h.checkIn(h.booking.id, 'g', h.photo('g'));
    at(h, 40);

    const again = await h.checkIn(h.booking.id, 'g', h.photo('g'));

    expect(again).toEqual({ ...first, outcome: 'replayed' });
    expect(h.relayed).toHaveLength(1);
  });

  it('accepts exactly at both ends of the window, and refuses outside it', async () => {
    for (const [offset, outcome] of [[-30, 'checked_in'], [15, 'checked_in']] as const) {
      const h = await setUp();
      at(h, offset);
      expect((await h.checkIn(h.booking.id, 'g', h.photo('g'))).outcome).toBe(outcome);
    }
    const early = await setUp();
    at(early, -31);
    expect(await early.checkIn(early.booking.id, 'g', early.photo('g'))).toEqual({
      outcome: 'too_early',
      opensAt: new Date(early.start.getTime() - minutes(30)).toISOString(),
    });
    const late = await setUp();
    at(late, 16);
    expect(await late.checkIn(late.booking.id, 'g', late.photo('g'))).toEqual({
      outcome: 'too_late',
      closedAt: new Date(late.start.getTime() + minutes(15)).toISOString(),
    });
    expect(late.current(late.booking.id).checkIn).toBeNull();
  });

  it('refuses what the goalkeeper cannot check in to, and photos that are not theirs', async () => {
    const h = await setUp();
    at(h, -5);
    h.goalkeeper('other');

    expect(await h.checkIn(h.booking.id, 'other', h.photo('other'))).toEqual({ outcome: 'booking_not_found' });
    expect(await h.checkIn('missing', 'g', h.photo('g'))).toEqual({ outcome: 'booking_not_found' });
    expect(await h.checkIn(h.booking.id, 'g', h.photo('someone-else'))).toEqual({ outcome: 'invalid_photo' });
    expect(await h.checkIn(h.booking.id, 'g', 'no-such-image')).toEqual({ outcome: 'invalid_photo' });
    expect(await h.checkIn(h.booking.id, 'nobody', h.photo('nobody'))).toEqual({ outcome: 'not_a_goalkeeper' });
    expect(h.current(h.booking.id).checkIn).toBeNull();
  });

  it('refuses a booking the goalkeeper withdrew from', async () => {
    const h = await setUp();
    h.clock.set(new Date(h.start.getTime() - minutes(40)));
    await h.withdraw(h.booking.id, 'g');
    at(h, -5);

    expect(await h.checkIn(h.booking.id, 'g', h.photo('g'))).toEqual({ outcome: 'not_assigned', status: 'goalkeeper_withdrew' });
  });

  it("uses the country's window values", async () => {
    const h = await setUp();
    h.regionRepository.seed(new Region({ id: 'region-antioquia', name: 'Antioquia', countryId: 'country-co' }));
    h.bookingSettingsRepository.seed(new BookingSettings({ id: 's-co', scope: 'country', refId: 'country-co', checkInWindow: { closesMinutesAfter: 5 } }));
    at(h, 6);

    expect((await h.checkIn(h.booking.id, 'g', h.photo('g'))).outcome).toBe('too_late');
  });
});

describe('CheckInNoticeHandler — US2: the client is told the goalkeeper arrived', () => {
  it('sends one "arrived" notice to the client, even with redeliveries', async () => {
    const h = await setUp();
    await h.phone('client-a');
    at(h, -5);
    await h.checkIn(h.booking.id, 'g', h.photo('g'));

    for (const event of h.relayed) await h.checkInNotices.handle(event);
    for (const event of h.relayed) await h.checkInNotices.handle(event);

    const notices = h.notifications.all().filter((item) => item.userId === 'client-a');
    expect(notices).toMatchObject([
      { type: 'booking.goalkeeper_arrived', body: expect.stringMatching(/^Tu portero llegó al partido en Bello · /), dedupeKey: `goalkeeper-arrived:${h.booking.id}` },
    ]);
    expect(h.pushSender.calls).toHaveLength(1);
  });
});

