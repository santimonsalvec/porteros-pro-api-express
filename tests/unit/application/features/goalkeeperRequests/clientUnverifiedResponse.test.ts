import { describe, expect, it } from 'vitest';
import { toRequestResponse } from '../../../../../src/application/features/goalkeeperRequests/common/requestResponse.js';
import { Booking } from '../../../../../src/domain/bookings/booking.js';
import { GoalkeeperRequest } from '../../../../../src/domain/bookings/goalkeeperRequest.js';
import { buildRequest, buildRequestBookings } from '../../../../fixtures/quoteFixtures.js';

const startsAt = new Date('2026-09-21T20:00:00.000Z');
const now = new Date('2026-09-21T18:05:00.000Z');

/** What the client reads of a goalkeeper without the seal (admin spec 030, contracts B3). */
describe('the client\'s request — goalkeepers without the seal', () => {
  const base = buildRequest('r-1', startsAt, { goalkeeperCount: 2 });
  const request = GoalkeeperRequest.rehydrate({ ...base, acceptsUnverified: true, unverifiedDiscountBps: 1000 });
  const [first, second] = buildRequestBookings(request, ['b-1', 'b-2']).map((booking) => Booking.rehydrate({ ...booking, unverifiedDiscountBps: 1000 }));
  const response = toRequestResponse(request, [first!.assign('gk-1', now, 'validated'), second!.assign('gk-2', now, 'verified')], now);

  it('says the client accepted goalkeepers without the seal', () => {
    expect(response).toMatchObject({ acceptsUnverified: true });
  });

  it('shows the discount and that the goalkeeper has no seal only where it applies', () => {
    const [discounted, full] = response.bookings;

    expect(discounted).toMatchObject({ discount: 6000, unverifiedGoalkeeper: true });
    expect(discounted!.total).toBe(discounted!.unitRate + discounted!.unitSurcharge - 6000);
    expect(full).not.toHaveProperty('discount');
    expect(full).not.toHaveProperty('unverifiedGoalkeeper');
  });

  it('never tells the client about validation, the tier or how a goalkeeper was verified', () => {
    expect(JSON.stringify(response)).not.toMatch(/validat|tier|vetting|method/i);
  });

  it('a request without the choice keeps the shape it always had', () => {
    expect(toRequestResponse(base, buildRequestBookings(base, ['b-1', 'b-2']), now)).not.toHaveProperty('acceptsUnverified');
  });
});
