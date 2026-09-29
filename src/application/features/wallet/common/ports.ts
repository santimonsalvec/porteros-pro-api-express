import type { TaxSetting } from '../../../../domain/wallet/taxSetting.js';
import type { CommissionSetting } from '../../../../domain/wallet/commissionSetting.js';
import type { Wallet } from '../../../../domain/wallet/wallet.js';
import type { WalletMovement, WalletMovementProps } from '../../../../domain/wallet/walletMovement.js';

/** A movement before the store assigns its sequence and resulting balance. */
export type MovementDraft = Omit<WalletMovementProps, 'walletId' | 'sequence' | 'balanceAfter'> & {
  goalkeeperId: string;
};

export type AppendResult =
  | { kind: 'recorded'; movement: WalletMovement; wallet: Wallet }
  /** A movement with the same cause already exists; nothing changed. */
  | { kind: 'duplicate'; movement: WalletMovement }
  /** A guarded debit would leave the balance below zero; nothing was recorded. */
  | { kind: 'insufficient_funds'; balance: number };

/**
 * Records one movement atomically: the balance, the wallet's sequence and the movement change
 * together or not at all; only penalties may take the balance below zero; one movement per cause.
 */
export interface IWalletStore {
  append(draft: MovementDraft): Promise<AppendResult>;
}

export interface IWalletRepository {
  /** `null` before the wallet's first movement (it is created lazily). */
  findByGoalkeeperId(goalkeeperId: string): Promise<Wallet | null>;
  /** The existing wallets among these goalkeepers (a missing one means balance 0). */
  findByGoalkeeperIds(goalkeeperIds: readonly string[]): Promise<Wallet[]>;
}

export interface IWalletMovementRepository {
  findByCauseKey(causeKey: string): Promise<WalletMovement | null>;
  findById(id: string): Promise<WalletMovement | null>;
  /** Newest first (sequence descending). */
  listForWallet(walletId: string, skip: number, limit: number): Promise<WalletMovement[]>;
}

/** Externally seeded commission settings. Read-only. */
export interface ICommissionSettingRepository {
  findFor(refs: { zoneIds: string[]; cityIds: string[]; countryIds: string[] }): Promise<CommissionSetting[]>;
}

/** The effective commission of each zone (zone → anchor city → country), `null` when none is configured. */
export interface ICommissionResolver {
  resolveForZones(zoneIds: string[]): Promise<Map<string, number | null>>;
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
