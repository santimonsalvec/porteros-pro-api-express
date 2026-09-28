import { Entity } from '../common/entity.js';
import { InvalidConfigurationError } from '../pricing/invalidConfigurationError.js';

export type CommissionScope = 'country' | 'city' | 'zone';

/**
 * The platform's fixed commission per accepted booking, defined for a country, an anchor city or
 * a zone; the most specific applies (FR-009). Externally seeded, read-only here.
 */
export class CommissionSetting extends Entity<string> {
  readonly scope: CommissionScope;
  /** A `Country` id, an anchor `City` id or a `Zone` id, per `scope`. */
  readonly refId: string;
  /** Whole units of the country's currency. */
  readonly amount: number;

  constructor(params: { id: string; scope: string; refId: string; amount: number }) {
    super(params.id);
    const where = `commissionSettings document ${params.id}`;
    if (params.scope !== 'country' && params.scope !== 'city' && params.scope !== 'zone') {
      throw new InvalidConfigurationError(`${where}: unknown scope '${params.scope}'`);
    }
    if (typeof params.refId !== 'string' || params.refId === '') {
      throw new InvalidConfigurationError(`${where}: refId is required`);
    }
    if (!Number.isInteger(params.amount) || params.amount <= 0) {
      throw new InvalidConfigurationError(`${where}: amount must be a positive integer`);
    }
    this.scope = params.scope;
    this.refId = params.refId;
    this.amount = params.amount;
  }
}
