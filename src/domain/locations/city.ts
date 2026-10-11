import { Entity } from '../common/entity.js';
import { readRevision } from '../common/revision.js';

/** Pre-existing, externally-owned reference data — this system only reads it. */
export class City extends Entity<string> {
  readonly name: string;
  readonly regionId: string;
  /** Self-reference to this city's "anchor" — the city that actually owns `Zone` documents. `null` when this city is itself an anchor. */
  readonly zoneCityId: string | null;
  /** IANA time-zone identifier (e.g. `America/Bogota`). `null` when the data owner has not set one — such a city cannot be quoted. */
  readonly timeZone: string | null;
  /** Official codes of the city and its department (DANE in Colombia), for electronic invoicing (feature 023). */
  readonly daneStateCode: string | null;
  readonly daneCityCode: string | null;
  /** Edit counter for the admin's optimistic concurrency; 0 when never edited there. */
  readonly revision: number;

  constructor(params: {
    id: string;
    name: string;
    regionId: string;
    zoneCityId: string | null;
    timeZone?: string | null;
    daneStateCode?: string | null;
    daneCityCode?: string | null;
    revision?: number;
  }) {
    super(params.id);
    this.name = params.name;
    this.regionId = params.regionId;
    this.zoneCityId = params.zoneCityId;
    this.timeZone = params.timeZone ?? null;
    this.daneStateCode = params.daneStateCode ?? null;
    this.daneCityCode = params.daneCityCode ?? null;
    this.revision = readRevision(params.revision, `cities document ${params.id}`);
  }
}
