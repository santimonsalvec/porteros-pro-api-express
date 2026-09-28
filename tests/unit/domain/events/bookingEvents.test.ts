import { describe, expect, it } from 'vitest';
import { bookingCreated, goalkeeperAssigned } from '../../../../src/domain/events/bookingEvents.js';
import { buildRequest, buildRequestBookings } from '../../../fixtures/quoteFixtures.js';

const AT = new Date('2026-09-28T18:00:00.000Z');
const request = buildRequest('req-1', new Date('2026-09-29T20:00:00.000Z'), { goalkeeperCount: 2, commission: 7000 });
const [booking] = buildRequestBookings(request);

describe('booking events', () => {
  it('describes a created booking with ids first and a small payload', () => {
    expect(bookingCreated('ev-1', booking!, request, AT)).toEqual({
      id: 'ev-1',
      type: 'booking.created',
      version: 1,
      occurredAt: AT,
      bookingId: booking!.id,
      requestId: 'req-1',
      payload: {
        clientId: booking!.clientId,
        zoneId: booking!.zoneId,
        startsAt: booking!.startsAt,
        commission: 7000,
        currency: 'COP',
        goalkeeperCount: 2,
      },
    });
  });

  it('describes an assignment with the goalkeeper and the commission charged', () => {
    const assigned = booking!.assign('gk-1', AT);

    expect(goalkeeperAssigned('ev-2', assigned, AT)).toMatchObject({
      type: 'goalkeeper.assigned',
      bookingId: booking!.id,
      requestId: 'req-1',
      payload: { goalkeeperId: 'gk-1', clientId: booking!.clientId, commission: 7000 },
    });
  });

  it('refuses to describe an assignment of a booking nobody holds', () => {
    expect(() => goalkeeperAssigned('ev-3', booking!, AT)).toThrow(/not assigned/);
  });

  it('describes an expiry and a "cancel all" cancellation (feature 016)', async () => {
    const { bookingExpired, bookingCancelled } = await import('../../../../src/domain/events/bookingEvents.js');
    const { buildBooking } = await import('../../../fixtures/offerFixtures.js');
    const at = new Date('2026-10-04T20:31:00.000Z');
    const pending = buildBooking();
    const held = buildBooking({ id: 'booking-2', status: 'assigned', goalkeeperId: 'gk-1', assignedAt: at });

    expect(bookingExpired('ev-1', pending, at)).toEqual({
      id: 'ev-1',
      type: 'booking.expired',
      version: 1,
      occurredAt: at,
      bookingId: 'booking-1',
      requestId: 'request-1',
      payload: { clientId: 'client-1', zoneId: 'zone-bello', startsAt: pending.startsAt },
    });
    expect(bookingCancelled('ev-2', held, at, { amount: 7000, currency: 'COP' }).payload).toEqual({
      clientId: 'client-1',
      zoneId: 'zone-bello',
      startsAt: held.startsAt,
      goalkeeperId: 'gk-1',
      refundedAmount: 7000,
      currency: 'COP',
      reason: 'cancel_all',
      by: 'system',
    });
    expect(bookingCancelled('ev-3', pending, at, null).payload).toMatchObject({ goalkeeperId: null, refundedAmount: null, currency: 'COP' });
  });

  it('names the client as the author of a client cancellation (feature 017)', async () => {
    const { bookingCancelled } = await import('../../../../src/domain/events/bookingEvents.js');
    const { buildBooking } = await import('../../../fixtures/offerFixtures.js');
    const at = new Date('2026-10-04T19:00:00.000Z');

    const event = bookingCancelled('ev-1', buildBooking(), at, null, { reason: 'client_cancelled', by: 'client' });

    expect(event.payload).toMatchObject({ reason: 'client_cancelled', by: 'client', goalkeeperId: null, refundedAmount: null });
  });

  it('describes a withdrawal and marks a replacement booking (feature 018)', async () => {
    const { bookingCreated, goalkeeperWithdrew } = await import('../../../../src/domain/events/bookingEvents.js');
    const { Booking } = await import('../../../../src/domain/bookings/booking.js');
    const { GoalkeeperIncident } = await import('../../../../src/domain/goalkeepers/goalkeeperIncident.js');
    const held = booking!.assign('gk-1', AT);
    const replacement = Booking.replacementFor(held, 'b-new', 'gk-1', AT);
    const endsAt = new Date(AT.getTime() + 3 * 86_400_000);
    const incident = GoalkeeperIncident.rehydrate({
      id: 'w-1',
      kind: 'withdrawal',
      goalkeeperId: 'gk-1',
      bookingId: held.id,
      requestId: 'req-1',
      startsAt: held.startsAt,
      occurredAt: AT,
      noticeMinutes: 90,
      late: true,
      reason: 'Me enfermé',
      replacementBookingId: 'b-new',
      penalties: [{ id: 'p-1', kind: 'late', days: 3, startsAt: AT, endsAt, reversal: null }],
      moneyReversal: null,
      forgivenAt: null,
    });

    expect(goalkeeperWithdrew('ev-3', held, incident, endsAt, AT)).toEqual({
      id: 'ev-3',
      type: 'goalkeeper.withdrew',
      version: 1,
      occurredAt: AT,
      bookingId: held.id,
      requestId: 'req-1',
      payload: {
        goalkeeperId: 'gk-1',
        clientId: held.clientId,
        zoneId: held.zoneId,
        startsAt: held.startsAt,
        noticeMinutes: 90,
        late: true,
        replacementBookingId: 'b-new',
        suspendedUntil: endsAt,
        penalties: [{ kind: 'late', days: 3, endsAt }],
      },
    });
    const unpenalized = GoalkeeperIncident.rehydrate({ ...incident, penalties: [] });
    expect(goalkeeperWithdrew('ev-4', held, unpenalized, endsAt, AT).payload.suspendedUntil).toBeNull();
    expect(bookingCreated('ev-5', replacement, request, AT).payload.replacesBookingId).toBe(held.id);
    expect(bookingCreated('ev-6', booking!, request, AT).payload).not.toHaveProperty('replacesBookingId');
  });
});
