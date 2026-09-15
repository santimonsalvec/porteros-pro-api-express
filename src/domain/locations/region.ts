import { Entity } from '../common/entity.js';

/** Pre-existing, externally-owned reference data — this system only reads it. */
export class Region extends Entity<string> {
  readonly name: string;

  constructor(params: { id: string; name: string }) {
    super(params.id);
    this.name = params.name;
  }
}
