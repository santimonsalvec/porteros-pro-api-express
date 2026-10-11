import { InvalidConfigurationError } from '../pricing/invalidConfigurationError.js';

/**
 * The edit counter of a reference document (spec 003 of the admin, research §5). Seeded
 * documents have none, which counts as 0; anything else that is not a non-negative integer
 * is broken configuration.
 */
export function readRevision(value: unknown, where: string): number {
  if (value === undefined || value === null) return 0;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new InvalidConfigurationError(`${where}: revision must be a non-negative integer`);
  }
  return value;
}
