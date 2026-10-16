import { Entity } from '../common/entity.js';
import { readRevision } from '../common/revision.js';

/** A real municipality (spec 031): billing reference data only, never where the service operates. */
export class City extends Entity<string> {
  readonly name: string;
  readonly regionId: string;
  /** Official codes of the city and its department (DANE in Colombia), for electronic invoicing (feature 023). */
  readonly daneStateCode: string | null;
  readonly daneCityCode: string | null;
  /** Edit counter for the admin's optimistic concurrency; 0 when never edited there. */
  readonly revision: number;

  constructor(params: {
    id: string;
    name: string;
    regionId: string;
    daneStateCode?: string | null;
    daneCityCode?: string | null;
    revision?: number;
  }) {
    super(params.id);
    this.name = params.name;
    this.regionId = params.regionId;
    this.daneStateCode = params.daneStateCode ?? null;
    this.daneCityCode = params.daneCityCode ?? null;
    this.revision = readRevision(params.revision, `cities document ${params.id}`);
  }
}
