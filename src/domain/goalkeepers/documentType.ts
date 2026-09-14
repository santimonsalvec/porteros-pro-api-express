import { Entity } from '../common/entity.js';

/**
 * A single accepted kind of identification document (spec Key Entities). Manually
 * seeded, read-only reference data from this system's perspective — mirrors
 * `Country`/`domain/countries/country.ts`.
 */
export class DocumentType extends Entity<string> {
  readonly code: string;
  readonly name: string;

  constructor(params: { id: string; code: string; name: string }) {
    super(params.id);
    this.code = params.code;
    this.name = params.name;
  }
}
