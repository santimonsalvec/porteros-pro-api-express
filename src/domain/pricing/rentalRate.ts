import { Entity } from '../common/entity.js';
import { readRevision } from '../common/revision.js';
import type { MatchLevel, PricedModality } from '../bookings/matchFormat.js';
import { InvalidConfigurationError } from './invalidConfigurationError.js';
import { parseTier } from './tier.js';

export type RentalRateScope = 'zone' | 'market';
export type RentalDurationMinutes = 60 | 90 | 120;

const ALLOWED_DURATIONS: readonly number[] = [60, 90, 120];

/** Price for ONE goalkeeper for one duration, at a zone or at a market. Externally seeded, read-only here. */
export class RentalRate extends Entity<string> {
  readonly scope: RentalRateScope;
  /** A `Zone` id when `scope` is `'zone'`; a `Market` id when `'market'`. */
  readonly refId: string;
  readonly durationMinutes: RentalDurationMinutes;
  /** Whole currency units (`40000` = 40.000 COP). The currency is the country's, never stored per rate. */
  readonly amount: number;
  /** The modality this rate is for; `null` = every modality (the general rate, feature 024). */
  readonly modality: PricedModality | null;
  /** The level this rate is for; `null` = every level. Only set together with `modality`. */
  readonly level: MatchLevel | null;

  /** Optimistic-concurrency counter of the admin web (absent = 0). */
  readonly revision: number;
  constructor(params: {
    id: string;
    scope: string;
    refId: string;
    durationMinutes: number;
    amount: number;
    modality?: string | null;
    level?: string | null;
    revision?: number;
  }) {
    super(params.id);
    const where = `rentalRates document ${params.id}`;
    if (params.scope !== 'zone' && params.scope !== 'market') {
      throw new InvalidConfigurationError(`${where}: unknown scope '${params.scope}'`);
    }
    if (typeof params.refId !== 'string' || params.refId === '') {
      throw new InvalidConfigurationError(`${where}: refId is required`);
    }
    if (!ALLOWED_DURATIONS.includes(params.durationMinutes)) {
      throw new InvalidConfigurationError(`${where}: durationMinutes must be 60, 90 or 120`);
    }
    if (!Number.isInteger(params.amount) || params.amount <= 0) {
      throw new InvalidConfigurationError(`${where}: amount must be an integer greater than 0`);
    }
    this.scope = params.scope;
    this.refId = params.refId;
    this.durationMinutes = params.durationMinutes as RentalDurationMinutes;
    this.amount = params.amount;
    const tier = parseTier(params.modality, params.level, where);
    this.modality = tier.modality;
    this.level = tier.level;
    this.revision = readRevision(params.revision, where);
  }
}
