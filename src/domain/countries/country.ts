import { Entity } from '../common/entity.js';
import { readRevision } from '../common/revision.js';

/** Pre-existing, externally-owned reference data — this system only reads it. */
export class Country extends Entity<string> {
  readonly name: string;
  readonly dialCode: string;
  readonly countryCode: string;
  /**
   * ISO 4217 currency code (e.g. `COP`) in which every price in this country is expressed.
   * `null` when the data owner has not set one — such a country cannot be quoted.
   */
  readonly currency: string | null;
  /** Edit counter for the admin's optimistic concurrency; 0 when never edited there. */
  readonly revision: number;

  constructor(params: { id: string; name: string; dialCode: string; countryCode: string; currency?: string | null; revision?: number }) {
    super(params.id);
    this.name = params.name;
    this.dialCode = params.dialCode;
    this.countryCode = params.countryCode;
    this.currency = params.currency ?? null;
    this.revision = readRevision(params.revision, `countries document ${params.id}`);
  }
}
