import { z } from 'zod';
import type { DomainEvent } from '../../../../domain/events/domainEvent.js';

const isoDate = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

const envelopeFields = {
  id: z.string().min(1),
  version: z.literal(1),
  occurredAt: isoDate,
  bookingId: z.string().min(1),
  requestId: z.string().min(1),
};

const eventSchema = z.discriminatedUnion('type', [
  z.object({
    ...envelopeFields,
    type: z.literal('booking.created'),
    payload: z.object({
      clientId: z.string(),
      zoneId: z.string(),
      startsAt: isoDate,
      commission: z.number(),
      currency: z.string(),
      goalkeeperCount: z.number().int(),
    }),
  }),
  z.object({
    ...envelopeFields,
    type: z.literal('goalkeeper.assigned'),
    payload: z.object({
      goalkeeperId: z.string(),
      clientId: z.string(),
      zoneId: z.string(),
      startsAt: isoDate,
      commission: z.number(),
    }),
  }),
]);

/**
 * An event as received from the messaging service (JSON, dates as ISO strings), or `null` when
 * it is malformed or of a type/version this service does not know — to be acknowledged and
 * logged, never retried (FR-015).
 */
export function parseEvent(json: unknown): DomainEvent | null {
  const parsed = eventSchema.safeParse(json);
  return parsed.success ? (parsed.data as DomainEvent) : null;
}

const pushEnvelopeSchema = z.object({
  message: z.object({
    data: z.string().min(1),
    messageId: z.string().optional(),
  }),
});

/** Decodes a Pub/Sub push body: `message.data` is the base64 of the event JSON. */
export function decodePushEnvelope(body: unknown): { event: DomainEvent | null; messageId?: string } {
  const envelope = pushEnvelopeSchema.safeParse(body);
  if (!envelope.success) return { event: null };
  const { data, messageId } = envelope.data.message;
  try {
    const json: unknown = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
    return { event: parseEvent(json), messageId };
  } catch {
    return { event: null, messageId };
  }
}
