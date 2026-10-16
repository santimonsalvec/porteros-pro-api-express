import type { UnverifiedDiscountSetting } from '../../../../domain/pricing/unverifiedDiscount.js';
import type { PricedModality } from '../../../../domain/bookings/matchFormat.js';
import type { BookingSettingsFields } from '../../../../domain/pricing/bookingSettingsRules.js';
import type { UpdateResult } from '../../geography/common/ports.js';
import type { MatchTier } from '../../../../domain/pricing/tieredRate.js';
import type { CommissionSetting } from '../../../../domain/operatingBalance/commissionSetting.js';

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
  amount: number;
  revision: number;
  /** The domain refuses the stored document (a seeded mistake): shown marked, fixed by editing it. */
  invalid: boolean;
}

export type RentalRateRecord = PriceRecord<'zone' | 'market'> & { durationMinutes: number };
export type CommissionRecord = PriceRecord<'country' | 'market' | 'zone'>;

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
  scope: 'country' | 'market';
  refId: string;
  fields: StoredBookingSettings;
  revision: number;
  invalid: boolean;
}

export interface IBookingSettingsAdmin {
  getByScope(scope: 'country' | 'market', refId: string): Promise<BookingSettingsRecord | null>;
  /** Creates the level when `expectedRevision` is `null`; replaces its values otherwise. */
  save(scope: 'country' | 'market', refId: string, expectedRevision: number | null, fields: StoredBookingSettings): Promise<UpdateResult>;
  /** Every market-level document: a few dozen at most, one per market that overrides something. */
  listMarketScoped(): Promise<BookingSettingsRecord[]>;
}

/** The commission document that applies to one match in a zone (the quote's resolver, admin spec 004 simulator). */
export interface ICommissionSettingResolver {
  resolveSettingForMatch(zoneId: string, match: MatchTier): Promise<CommissionSetting | null>;
}

export type DiscountCreateResult = { outcome: 'created' } | { outcome: 'duplicate'; existingId: string | null };
export type DiscountDeleteResult = 'deleted' | 'stale' | 'not_found';

/** What one level of the unverified settings holds; `null` = inherit (admin spec 030). */
export interface UnverifiedFields {
  discountBps: number | null;
  verifiedPriorityMinutes: number | null;
}

/** The unverified discount and priority window by level (admin spec 030). Read by the quote and written by the admin. */
export interface IUnverifiedDiscountRepository {
  /** Every setting for any of these zones, markets or countries, in one read. */
  findFor(refs: { zoneIds: string[]; marketIds: string[]; countryIds: string[] }): Promise<UnverifiedDiscountSetting[]>;
  getById(id: string): Promise<UnverifiedDiscountSetting | null>;
  create(setting: { id: string; scope: string; refId: string } & UnverifiedFields): Promise<DiscountCreateResult>;
  update(id: string, expectedRevision: number, fields: UnverifiedFields): Promise<'saved' | 'stale'>;
  delete(id: string, expectedRevision: number): Promise<DiscountDeleteResult>;
}
