import { Entity } from '../common/entity.js';
import { InvalidConfigurationError } from './invalidConfigurationError.js';
import { readRevision } from '../common/revision.js';

/**
 * A playing surface the client can pick (feature 024). It never changes the price. Externally
 * seeded in `matchSurfaces`, read-only here: deactivating one hides it from new quotes only.
 */
export class MatchSurface extends Entity<string> {
  readonly name: string;
  readonly active: boolean;
  /** Ascending display order. */
  readonly order: number;
  /** Edit counter for the admin's optimistic concurrency; 0 when never edited there. */
  readonly revision: number;

  constructor(params: { id: string; name: string; active: boolean; order: number; revision?: number }) {
    super(params.id);
    const where = `matchSurfaces document ${params.id}`;
    if (typeof params.id !== 'string' || params.id === '') {
      throw new InvalidConfigurationError(`${where}: _id is required`);
    }
    if (typeof params.name !== 'string' || params.name.trim() === '') {
      throw new InvalidConfigurationError(`${where}: name is required`);
    }
    if (typeof params.active !== 'boolean') {
      throw new InvalidConfigurationError(`${where}: active must be a boolean`);
    }
    if (!Number.isInteger(params.order)) {
      throw new InvalidConfigurationError(`${where}: order must be an integer`);
    }
    this.name = params.name.trim();
    this.active = params.active;
    this.order = params.order;
    this.revision = readRevision(params.revision, where);
  }
}
