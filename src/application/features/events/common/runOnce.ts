import type { IClock } from '../../../common/clock.js';
import type { IProcessedEventStore } from './ports.js';

/**
 * Runs a consumer's effect for an event at most once in the common case (research §7): a
 * repeated delivery of an event this consumer already processed is skipped.
 *
 * Two deliveries arriving at the same moment can both pass the check, so the effect itself must
 * be safe to repeat — keyed by the event id (like a wallet `causeKey`) or naturally idempotent.
 * The marker saves work; the effect's own key is the real guarantee.
 */
export async function runOnce(
  store: IProcessedEventStore,
  clock: IClock,
  consumer: string,
  eventId: string,
  effect: () => Promise<void>,
): Promise<'processed' | 'duplicate'> {
  const key = `${consumer}:${eventId}`;
  if (await store.has(key)) return 'duplicate';
  await effect();
  await store.markProcessed(key, clock.now());
  return 'processed';
}
