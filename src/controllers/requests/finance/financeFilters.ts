import { z } from 'zod';

/** An instant of a date filter; the admin turns local days into these (admin spec 007, research §11). */
export const instantField = z
  .string()
  .datetime({ offset: true, message: 'Must be an ISO 8601 instant.' })
  .transform((value) => new Date(value));

export const idField = z.string().trim().min(1).max(100);

/** `from` before `to`, when both are given. */
export function fromBeforeTo(query: { from?: Date; to?: Date }): boolean {
  return !query.from || !query.to || query.from.getTime() < query.to.getTime();
}

export const FROM_BEFORE_TO = { message: 'Must be after from.', path: ['to'] };
