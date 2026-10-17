import type { MatchTier } from '../../../../domain/pricing/tieredRate.js';
import type { TaxSetting } from '../../../../domain/operatingBalance/taxSetting.js';
import type { CommissionSetting } from '../../../../domain/operatingBalance/commissionSetting.js';
import type { OperatingBalance } from '../../../../domain/operatingBalance/operatingBalance.js';
import type { BalanceMovement, BalanceMovementProps } from '../../../../domain/operatingBalance/balanceMovement.js';

/** A movement before the store assigns its sequence and resulting balance. */
export type MovementDraft = Omit<BalanceMovementProps, 'operatingBalanceId' | 'sequence' | 'balanceAfter'> & {
  goalkeeperId: string;
};

export type AppendResult =
  | { kind: 'recorded'; movement: BalanceMovement; operatingBalance: OperatingBalance }
  /** A movement with the same cause already exists; nothing changed. */
  | { kind: 'duplicate'; movement: BalanceMovement }
  /** A guarded debit would leave the balance below zero; nothing was recorded. */
  | { kind: 'insufficient_funds'; balance: number };

/**
 * Records one movement atomically: the balance, the operating balance's sequence and the movement change
 * together or not at all; only penalties may take the balance below zero; one movement per cause.
 */
export interface IOperatingBalanceStore {
  append(draft: MovementDraft): Promise<AppendResult>;
}

export interface IOperatingBalanceRepository {
  /** `null` before the operating balance's first movement (it is created lazily). */
  findByGoalkeeperId(goalkeeperId: string): Promise<OperatingBalance | null>;
  /** The existing operating balances among these goalkeepers (a missing one means balance 0). */
  findByGoalkeeperIds(goalkeeperIds: readonly string[]): Promise<OperatingBalance[]>;
}

export interface IBalanceMovementRepository {
  findByCauseKey(causeKey: string): Promise<BalanceMovement | null>;
  findById(id: string): Promise<BalanceMovement | null>;
  /** Newest first (sequence descending). */
  listForOperatingBalance(operatingBalanceId: string, skip: number, limit: number): Promise<BalanceMovement[]>;
}

/** Commission rules, read-only here; the admin writes them through `ICommissionAdmin`. */
export interface ICommissionSettingRepository {
  findFor(refs: { zoneIds: string[]; marketIds: string[]; countryIds: string[]; goalkeeperIds?: string[] }): Promise<CommissionSetting[]>;
}

/** Who is asking: their own active rule (feature 033) beats every geography level. */
export interface CommissionViewer {
  goalkeeperId: string;
  now: Date;
}

/** What one goalkeeper's offers depend on (feature 033). */
export interface GoalkeeperThreshold {
  /** Per zone, the lowest net any match there could cost them; `null` when a zone has no rule, or a percentage rule and no rate. */
  lowest: Map<string, number | null>;
  /** Their own rules active now in their country: what a booking really costs them (`ownCommissionFor`). */
  ownRules: CommissionSetting[];
}

/**
 * The rule that applies to a match (goalkeeper → zone → market → country, then modality → general
 * within each level), `null` when none is configured (feature 033). Callers compute the amounts
 * with `commissionFor(rule, base, match)`.
 */
export interface ICommissionResolver {
  /** The rule of one match in a zone, for the viewer when given. */
  resolveForMatch(zoneId: string, match: MatchTier, viewer?: CommissionViewer): Promise<CommissionSetting | null>;
  /**
   * Per goalkeeper, the "can see offers" threshold (FR-017): their own rule or the zone's, applied
   * to the lowest rate of each tier, plus the own rules themselves.
   */
  lowestForGoalkeepers(goalkeepers: readonly { goalkeeperId: string; zoneIds: readonly string[] }[], now: Date): Promise<Map<string, GoalkeeperThreshold>>;
}

/** Each country's VAT rate (feature 023), set by administrators. */
export interface ITaxSettingsRepository {
  getByCountry(countryId: string): Promise<TaxSetting | null>;
  save(setting: TaxSetting): Promise<void>;
}

/** The VAT rate charged on top of commissions and penalties in a country (0 when not configured). */
export interface IVatRateResolver {
  forCountry(countryId: string): Promise<number>;
  /** The rate of the country a market belongs to; 0 when unresolved. */
  forMarket(marketId: string): Promise<number>;
}
