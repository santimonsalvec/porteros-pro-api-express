import type { UsageReason } from './ports.js';

/** What deleting a reference record answers (admin spec 003, research §8). */
export type DeleteResult = { outcome: 'deleted' } | { outcome: 'not_found' } | { outcome: 'in_use'; reason: UsageReason };

/**
 * Deletes after checking that nothing points at the record. The check and the delete are not
 * atomic: a new reference in between is rare in an admin tool, and the readiness page shows it.
 */
export async function deleteUnused(
  exists: () => Promise<boolean>,
  usage: () => Promise<UsageReason | null>,
  remove: () => Promise<boolean>,
): Promise<DeleteResult> {
  if (!(await exists())) return { outcome: 'not_found' };
  const reason = await usage();
  if (reason) return { outcome: 'in_use', reason };
  return (await remove()) ? { outcome: 'deleted' } : { outcome: 'not_found' };
}
