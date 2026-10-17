import { Entity } from '../common/entity.js';
import { readRevision } from '../common/revision.js';
import type { PricedModality } from '../bookings/matchFormat.js';
import { InvalidConfigurationError } from '../pricing/invalidConfigurationError.js';
import { parseTier } from '../pricing/tier.js';
import { BPS } from './vat.js';

export type CommissionScope = 'country' | 'market' | 'zone' | 'goalkeeper';
const SCOPES: readonly string[] = ['country', 'market', 'zone', 'goalkeeper'];

/** How a rule charges: only a fixed amount, only a percentage, or both summed (feature 033). */
export type CommissionKind = 'fixed' | 'percent' | 'mixed';

/**
 * The platform's commission rule per accepted booking, defined for a country, a market, a zone or
 * one goalkeeper; the most specific applies (goalkeeper → zone → market → country). A rule is a
 * fixed amount, a percentage of one goalkeeper's booking price, or both summed (feature 033).
 * A goalkeeper's rule is bound to the country it was created in and may expire.
 */
export class CommissionSetting extends Entity<string> {
  readonly scope: CommissionScope;
  /** A `Country`, `Market` or `Zone` id, or the goalkeeper's `userId`, per `scope`. */
  readonly refId: string;
  /** Whole units of the country's currency; 0 = no fixed component. */
  readonly fixedAmount: number;
  /** Basis points of the booking's base (one goalkeeper's rate + surcharge); 0 = no percentage. */
  readonly percentBps: number;
  /** The modality this commission is for; `null` = every modality (feature 024). */
  readonly modality: PricedModality | null;
  /** Goalkeeper rules only: the country of the goalkeeper's market when the rule was created. */
  readonly countryId: string | null;
  /** Goalkeeper rules only: when the rule stops applying; `null` = never. */
  readonly validUntil: Date | null;

  /** Optimistic-concurrency counter of the admin web (absent = 0). */
  readonly revision: number;
  constructor(params: {
    id: string;
    scope: string;
    refId: string;
    fixedAmount?: number;
    percentBps?: number;
    /** Legacy documents (before feature 033): the fixed amount. */
    amount?: number;
    modality?: string | null;
    countryId?: string | null;
    validUntil?: Date | null;
    revision?: number;
  }) {
    super(params.id);
    const where = `commissionSettings document ${params.id}`;
    if (!SCOPES.includes(params.scope)) {
      throw new InvalidConfigurationError(`${where}: unknown scope '${params.scope}'`);
    }
    if (typeof params.refId !== 'string' || params.refId === '') {
      throw new InvalidConfigurationError(`${where}: refId is required`);
    }
    const fixedAmount = params.fixedAmount ?? params.amount ?? 0;
    const percentBps = params.percentBps ?? 0;
    if (!Number.isInteger(fixedAmount) || fixedAmount < 0) {
      throw new InvalidConfigurationError(`${where}: fixedAmount must be a non-negative integer`);
    }
    if (!Number.isInteger(percentBps) || percentBps < 0 || percentBps > BPS) {
      throw new InvalidConfigurationError(`${where}: percentBps must be an integer between 0 and ${BPS}`);
    }
    if (fixedAmount === 0 && percentBps === 0) {
      throw new InvalidConfigurationError(`${where}: a rule needs a fixed amount, a percentage or both`);
    }
    const scope = params.scope as CommissionScope;
    const countryId = params.countryId ?? null;
    const validUntil = params.validUntil ?? null;
    if (scope === 'goalkeeper') {
      if (typeof countryId !== 'string' || countryId === '') throw new InvalidConfigurationError(`${where}: countryId is required for a goalkeeper rule`);
      if (validUntil !== null && (!(validUntil instanceof Date) || Number.isNaN(validUntil.getTime()))) {
        throw new InvalidConfigurationError(`${where}: validUntil must be a date or null`);
      }
    } else {
      if (countryId !== null) throw new InvalidConfigurationError(`${where}: countryId only applies to a goalkeeper rule`);
      if (validUntil !== null) throw new InvalidConfigurationError(`${where}: validUntil only applies to a goalkeeper rule`);
    }
    this.scope = scope;
    this.refId = params.refId;
    this.fixedAmount = fixedAmount;
    this.percentBps = percentBps;
    this.modality = parseTier(params.modality, where).modality;
    this.countryId = countryId;
    this.validUntil = validUntil;
    this.revision = readRevision(params.revision, where);
  }

  get kind(): CommissionKind {
    if (this.percentBps === 0) return 'fixed';
    if (this.fixedAmount === 0) return 'percent';
    return 'mixed';
  }

  /**
   * Whether the rule applies at `now` to a booking in `countryId`: geography rules always; a
   * goalkeeper's rule only in its own country and before `validUntil` (the expiry instant itself
   * is already expired).
   */
  isActiveAt(now: Date, countryId: string): boolean {
    if (this.scope !== 'goalkeeper') return true;
    if (this.countryId !== countryId) return false;
    return this.validUntil === null || this.validUntil.getTime() > now.getTime();
  }
}
