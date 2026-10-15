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

/** Externally seeded commission settings. Read-only. */
export interface ICommissionSettingRepository {
  findFor(refs: { zoneIds: string[]; cityIds: string[]; countryIds: string[] }): Promise<CommissionSetting[]>;
}

/**
 * The effective commission (zone → anchor city → country, then modality + level → modality →
 * general within each), `null` when none is configured.
 */
export interface ICommissionResolver {
  /** Per zone, the lowest commission any match there could carry (the "can see offers" threshold). */
  resolveForZones(zoneIds: string[]): Promise<Map<string, number | null>>;
  /** The commission of one match in a zone (feature 024). */
  resolveForMatch(zoneId: string, match: MatchTier): Promise<number | null>;
}

/** Each country's VAT rate (feature 023), set by administrators. */
export interface ITaxSettingsRepository {
  getByCountry(countryId: string): Promise<TaxSetting | null>;
  save(setting: TaxSetting): Promise<void>;
}

/** The VAT rate charged on top of commissions and penalties in a country (0 when not configured). */
export interface IVatRateResolver {
  forCountry(countryId: string): Promise<number>;
  /** The rate of the country a city belongs to (city → region → country); 0 when unresolved. */
  forCity(cityId: string): Promise<number>;
}
