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
});
