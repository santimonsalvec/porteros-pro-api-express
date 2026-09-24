import { Entity } from '../common/entity.js';

/** Pre-existing, externally-owned reference data — this system only reads it. */
export class Region extends Entity<string> {
  readonly name: string;
  /** The country this region belongs to (`countries._id`). A city's country is found through its region; `null` when the region has none recorded. */
  readonly countryId: string | null;

  constructor(params: { id: string; name: string; countryId?: string | null }) {
    super(params.id);
    this.name = params.name;
    this.countryId = params.countryId ?? null;
  }
}
