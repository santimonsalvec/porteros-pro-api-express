import { Entity } from '../common/entity.js';

/** Pre-existing, externally-owned reference data — this system only reads it. */
export class City extends Entity<string> {
  readonly name: string;
  readonly regionId: string;
  /** Self-reference to this city's "anchor" — the city that actually owns `Zone` documents. `null` when this city is itself an anchor. */
  readonly zoneCityId: string | null;

  constructor(params: { id: string; name: string; regionId: string; zoneCityId: string | null }) {
    super(params.id);
    this.name = params.name;
    this.regionId = params.regionId;
    this.zoneCityId = params.zoneCityId;
  }
}
