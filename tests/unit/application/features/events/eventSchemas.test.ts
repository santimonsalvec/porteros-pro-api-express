import { describe, expect, it } from 'vitest';
import { decodePushEnvelope, parseEvent } from '../../../../../src/application/features/events/common/eventSchemas.js';

const created = {
  id: 'ev-1',
  type: 'booking.created',
  version: 1,
  occurredAt: '2026-09-28T18:00:00.000Z',
  bookingId: 'b-1',
  requestId: 'r-1',
  payload: { clientId: 'c-1', zoneId: 'z-1', startsAt: '2026-09-29T20:00:00.000Z', commission: 7000, currency: 'COP', goalkeeperCount: 2 },
};
const assigned = {
  ...created,
  id: 'ev-2',
  type: 'goalkeeper.assigned',
  payload: { goalkeeperId: 'gk-1', clientId: 'c-1', zoneId: 'z-1', startsAt: '2026-09-29T20:00:00.000Z', commission: 7000 },
};
const push = (json: unknown) => ({ message: { data: Buffer.from(JSON.stringify(json)).toString('base64'), messageId: 'm-1' } });

describe('event parsing at the edge', () => {
  it('parses both event types and revives their dates', () => {
    expect(parseEvent(created)).toMatchObject({ type: 'booking.created', occurredAt: new Date(created.occurredAt), payload: { startsAt: new Date('2026-09-29T20:00:00.000Z') } });
    expect(parseEvent(assigned)).toMatchObject({ type: 'goalkeeper.assigned', payload: { goalkeeperId: 'gk-1' } });
  });

  it.each([
    ['an unknown type', { ...created, type: 'booking.exploded' }],
    ['another version', { ...created, version: 2 }],
    ['a missing field', { ...created, bookingId: undefined }],
    ['a bad date', { ...created, occurredAt: 'yesterday' }],
    ['not an object', 'hello'],
  ])('rejects %s', (_label, json) => {
    expect(parseEvent(json)).toBeNull();
  });

  it('decodes a Pub/Sub push envelope', () => {
    expect(decodePushEnvelope(push(created))).toMatchObject({ messageId: 'm-1', event: { id: 'ev-1' } });
  });

  it.each([
    ['no message', {}],
    ['data that is not base64 JSON', { message: { data: '@@@' } }],
    ['a valid envelope with a bad event', push({ nope: true })],
  ])('rejects %s', (_label, body) => {
    expect(decodePushEnvelope(body).event).toBeNull();
  });

  it('parses the expiry and cancellation events of feature 016', async () => {
    const { parseEvent } = await import('../../../../../src/application/features/events/common/eventSchemas.js');
    const envelope = { id: 'ev-1', version: 1, occurredAt: '2026-10-04T20:31:00.000Z', bookingId: 'b-1', requestId: 'r-1' };

    expect(parseEvent({ ...envelope, type: 'booking.expired', payload: { clientId: 'c', zoneId: 'z', startsAt: '2026-10-04T21:00:00.000Z' } })).toMatchObject({
      type: 'booking.expired',
      payload: { startsAt: new Date('2026-10-04T21:00:00.000Z') },
    });
    const cancelled = {
      ...envelope,
      type: 'booking.cancelled',
      payload: { clientId: 'c', zoneId: 'z', startsAt: '2026-10-04T21:00:00.000Z', goalkeeperId: null, refundedAmount: null, currency: 'COP', reason: 'cancel_all', by: 'system' },
    };
    expect(parseEvent(cancelled)).toMatchObject({ type: 'booking.cancelled' });
    expect(parseEvent({ ...cancelled, payload: { ...cancelled.payload, reason: 'other' } })).toBeNull();
    expect(parseEvent({ ...cancelled, payload: { ...cancelled.payload, reason: 'client_cancelled', by: 'client' } })).toMatchObject({
      payload: { reason: 'client_cancelled', by: 'client' },
    });
  });

  it('parses a withdrawal and a replacement booking (feature 018)', () => {
    const withdrew = {
      ...created,
      id: 'ev-9',
      type: 'goalkeeper.withdrew',
      payload: {
        goalkeeperId: 'gk-1',
        clientId: 'c-1',
        zoneId: 'z-1',
        startsAt: '2026-09-29T20:00:00.000Z',
        noticeMinutes: 90,
        late: true,
        replacementBookingId: 'b-2',
        suspendedUntil: '2026-10-01T18:00:00.000Z',
        penalties: [{ kind: 'late', days: 3, endsAt: '2026-10-01T18:00:00.000Z' }],
      },
    };
    expect(parseEvent(withdrew)).toMatchObject({
      type: 'goalkeeper.withdrew',
      payload: { suspendedUntil: new Date('2026-10-01T18:00:00.000Z'), penalties: [{ endsAt: new Date('2026-10-01T18:00:00.000Z') }] },
    });
    expect(parseEvent({ ...withdrew, payload: { ...withdrew.payload, replacementBookingId: null, suspendedUntil: null, penalties: [] } })).not.toBeNull();
    expect(parseEvent({ ...created, payload: { ...created.payload, replacesBookingId: 'b-0' } })).toMatchObject({ payload: { replacesBookingId: 'b-0' } });
  });

  it('parses a check-in (feature 020)', () => {
    const checkedIn = {
      ...created,
      id: 'ev-11',
      type: 'goalkeeper.checked_in',
      payload: { goalkeeperId: 'gk-1', clientId: 'c-1', zoneId: 'z-1', startsAt: '2026-09-29T20:00:00.000Z', checkedInAt: '2026-09-29T19:45:00.000Z', distanceMeters: null },
    };
    expect(parseEvent(checkedIn)).toMatchObject({ type: 'goalkeeper.checked_in', payload: { checkedInAt: new Date('2026-09-29T19:45:00.000Z'), distanceMeters: null } });
  });
});
