import { Entity } from '../common/entity.js';

/** Pre-existing, externally-owned reference data — this system only reads it. */
export class Country extends Entity<string> {
  readonly name: string;
  readonly dialCode: string;
  readonly countryCode: string;

  constructor(params: { id: string; name: string; dialCode: string; countryCode: string }) {
    super(params.id);
    this.name = params.name;
    this.dialCode = params.dialCode;
    this.countryCode = params.countryCode;
  }
}
