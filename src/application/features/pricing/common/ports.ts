import type { MatchLevel, PricedModality } from '../../../../domain/bookings/matchFormat.js';
import type { BookingSettingsFields } from '../../../../domain/pricing/bookingSettingsRules.js';
import type { UpdateResult } from '../../geography/common/ports.js';
import type { MatchTier } from '../../../../domain/pricing/tieredRate.js';
import type { CommissionSetting } from '../../../../domain/wallet/commissionSetting.js';

/**
 * The admin's write side of prices and booking rules (admin spec 004). Separate from the read-only
 * ports the quote uses (`IRentalRateRepository`, `IBookingSettingsRepository`,
 * `ICommissionSettingRepository`), which stay narrow. Every edit is optimistic on `revision`.
 */

/** A stored document as the admin sees it, even when seeded with a value the domain refuses. */
export interface PriceRecord<Scope extends string> {
  id: string;
  scope: Scope;
  refId: string;
  modality: PricedModality | null;
  level: MatchLevel | null;
  amount: number;
  revision: number;
  /** The domain refuses the stored document (a seeded mistake): shown marked, fixed by editing it. */
  invalid: boolean;
}

export type RentalRateRecord = PriceRecord<'zone' | 'city'> & { durationMinutes: number };
export type CommissionRecord = PriceRecord<'country' | 'city' | 'zone'>;

/** Which refs to read, per scope; `null` = every document. */
export type RefFilter = { scope: string; refIds: string[] }[] | null;

export interface PriceFilter {
  refs: RefFilter;
  /** `general` = no modality. */
  modality?: PricedModality | 'general';
}

/** `duplicate`: another document already has the same identity (the unique index of feature 024). */
export type CreateResult = { outcome: 'created' } | { outcome: 'duplicate'; existingId: string | null };

export interface IRentalRateAdmin {
  find(filter: PriceFilter & { durationMinutes?: number }): Promise<RentalRateRecord[]>;
  getById(id: string): Promise<RentalRateRecord | null>;
  create(rate: Omit<RentalRateRecord, 'revision' | 'invalid'>): Promise<CreateResult>;
  updateAmount(id: string, expectedRevision: number, amount: number): Promise<UpdateResult>;
  delete(id: string): Promise<boolean>;
}

export interface ICommissionAdmin {
  find(filter: PriceFilter): Promise<CommissionRecord[]>;
  getById(id: string): Promise<CommissionRecord | null>;
  create(commission: Omit<CommissionRecord, 'revision' | 'invalid'>): Promise<CreateResult>;
  updateAmount(id: string, expectedRevision: number, amount: number): Promise<UpdateResult>;
  delete(id: string): Promise<boolean>;
}

/** One level's stored values; every field `null` when not set there. */
export type StoredBookingSettings = Required<{
  [Field in keyof BookingSettingsFields]: NonNullable<BookingSettingsFields[Field]> | null;
}>;

export interface BookingSettingsRecord {
  scope: 'country' | 'city';
  refId: string;
  fields: StoredBookingSettings;
  revision: number;
  invalid: boolean;
}

export interface IBookingSettingsAdmin {
  getByScope(scope: 'country' | 'city', refId: string): Promise<BookingSettingsRecord | null>;
  /** Creates the level when `expectedRevision` is `null`; replaces its values otherwise. */
  save(scope: 'country' | 'city', refId: string, expectedRevision: number | null, fields: StoredBookingSettings): Promise<UpdateResult>;
  /** Every city-level document: a few dozen at most, one per anchor city that overrides something. */
  listCityScoped(): Promise<BookingSettingsRecord[]>;
}

/** The commission document that applies to one match in a zone (the quote's resolver, admin spec 004 simulator). */
export interface ICommissionSettingResolver {
  resolveSettingForMatch(zoneId: string, match: MatchTier): Promise<CommissionSetting | null>;
}
