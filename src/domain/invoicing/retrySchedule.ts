/** Waits between attempts to issue a document after a transient failure (research.md §2), in minutes. */
export const RETRY_SCHEDULE_MINUTES = [1, 5, 15, 60, 180, 360, 720, 1440] as const;

/** When the next attempt is due after `attempts` failed ones (then every 24 h). */
export function nextAttemptAt(attempts: number, now: Date): Date {
  const index = Math.max(0, attempts - 1);
  const minutes = RETRY_SCHEDULE_MINUTES[Math.min(index, RETRY_SCHEDULE_MINUTES.length - 1)]!;
  return new Date(now.getTime() + minutes * 60_000);
}
