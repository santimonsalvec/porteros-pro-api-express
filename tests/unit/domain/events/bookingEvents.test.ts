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
});
