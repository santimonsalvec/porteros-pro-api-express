import { describe, expect, it } from 'vitest';
import { parseEvent } from '../../../../src/application/features/events/common/eventSchemas.js';
import { commissionCharged, commissionRefunded, isBillingEvent } from '../../../../src/domain/events/billingEvents.js';

const AT = new Date('2026-09-29T12:00:00.000Z');
const PAYLOAD = { goalkeeperId: 'gk-1', movementId: 'm-1', vatMovementId: 'm-2', base: 7000, vat: 1330, vatRateBps: 1900, currency: 'COP' };

describe('billing events (feature 023)', () => {
  it('builds a commission charge with the booking envelope', () => {
    expect(commissionCharged('e-1', { bookingId: 'b-1', requestId: 'r-1' }, AT, PAYLOAD)).toEqual({
      id: 'e-1',
      type: 'commission.charged',
      version: 1,
      occurredAt: AT,
      bookingId: 'b-1',
      requestId: 'r-1',
      payload: PAYLOAD,
    });
  });

  it('round-trips through the JSON the messaging service carries', () => {
    const event = commissionRefunded('e-2', { bookingId: 'b-1', requestId: 'r-1' }, AT, { ...PAYLOAD, originalMovementId: 'm-0' });

    const parsed = parseEvent(JSON.parse(JSON.stringify(event)));

    expect(parsed).toEqual(event);
    expect(parsed && isBillingEvent(parsed)).toBe(true);
  });

  it('keeps a charge without VAT', () => {
    const event = commissionCharged('e-3', { bookingId: 'b-1', requestId: 'r-1' }, AT, { ...PAYLOAD, vatMovementId: null, vat: 0, vatRateBps: 0 });

    expect(parseEvent(JSON.parse(JSON.stringify(event)))).toEqual(event);
  });
});
