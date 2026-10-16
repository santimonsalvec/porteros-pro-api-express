import type { BillingData } from '../../../../domain/goalkeepers/billing.js';
import type { IRepository } from '../../../common/persistence/repository.js';
import type { GoalkeeperRegistration } from '../../../../domain/goalkeepers/goalkeeperRegistration.js';
import type { GoalkeeperProfile } from '../../../../domain/goalkeepers/goalkeeperProfile.js';
import type { DocumentType } from '../../../../domain/goalkeepers/documentType.js';
import type { Vetting } from '../../../../domain/goalkeepers/vetting.js';
import type { VettingLogEntry } from '../../../../domain/goalkeepers/vettingLogEntry.js';
import type { BackgroundCheck } from '../../../../domain/goalkeepers/backgroundCheck.js';
import type { MarketChangeFacts, MarketChangeRefusal } from '../../../../domain/goalkeepers/marketChange.js';

export interface IGoalkeeperRegistrationRepository extends IRepository<GoalkeeperRegistration, string> {
  getByUserId(userId: string): Promise<GoalkeeperRegistration | null>;
  /** Excludes the caller's own registration so resubmitting an already-owned document isn't flagged as a duplicate. */
  existsByDocument(documentType: string, documentNumber: string, excludeUserId?: string): Promise<boolean>;
}

export interface IGoalkeeperProfileRepository extends IRepository<GoalkeeperProfile, string> {
  getByUserId(userId: string): Promise<GoalkeeperProfile | null>;
  /**
   * Targeted, single-document update of only the given keys — never rewrites the whole
   * profile, so a concurrent `updateAvailability` (or any other field) is never lost.
   * Returns the profile as stored after the write, or `null` when the user has none.
   */
  updatePhysicalData(userId: string, fields: { heightCm?: number; weightKg?: number }): Promise<GoalkeeperProfile | null>;
  /** Replaces `marketId` and `zoneIds` together in one write; same return contract as `updatePhysicalData`. */
  updateAvailability(userId: string, marketId: string, zoneIds: string[]): Promise<GoalkeeperProfile | null>;
  /** Replaces the billing data in one write (spec 031); same return contract as `updatePhysicalData`. */
  updateBilling(userId: string, billing: BillingData): Promise<GoalkeeperProfile | null>;
  /** Profiles with any of these zones and the offers switch on (feature 015). */
  findOfferCandidates(zoneIds: readonly string[]): Promise<GoalkeeperProfile[]>;
  /** Sets the "available for offers" switch; returns the value before, or null without a profile. */
  setAvailableForOffers(userId: string, value: boolean): Promise<{ previous: boolean } | null>;
  /**
   * Replaces the vetting only if it is still at `expectedRevision` (admin spec 030; a profile
   * without vetting is at 0). `'stale'` when someone changed it first or there is no profile.
   */
  updateVetting(userId: string, expectedRevision: number, vetting: Vetting): Promise<'saved' | 'stale'>;
}

/** Minimal, read-only — mirrors `ICountryRepository`'s reference-data shape, no write capability needed. */
export interface IDocumentTypeRepository {
  getAll(): Promise<DocumentType[]>;
  findByCode(code: string): Promise<DocumentType | null>;
}

/** The append-only history of validation and verification decisions (admin spec 030). */
export interface IVettingLogRepository {
  append(entry: VettingLogEntry): Promise<void>;
  /** Newest first. */
  listForGoalkeeper(goalkeeperId: string, limit: number): Promise<VettingLogEntry[]>;
}

export type DeletePendingOutcome = 'deleted' | 'reviewed' | 'not_found';

/** The goalkeepers' criminal background certificates (admin spec 030). */
export interface IBackgroundCheckRepository {
  add(check: BackgroundCheck): Promise<void>;
  /** Newest upload first. */
  listForGoalkeeper(goalkeeperId: string): Promise<BackgroundCheck[]>;
  findForGoalkeeper(id: string, goalkeeperId: string): Promise<BackgroundCheck | null>;
  /** Writes the review only if the check is still at `expectedRevision`. */
  saveReview(check: BackgroundCheck, expectedRevision: number): Promise<'saved' | 'stale'>;
  /** Only a pending check of that goalkeeper; `'reviewed'` when it exists but was reviewed. */
  deletePending(id: string, goalkeeperId: string): Promise<DeletePendingOutcome>;
}

export type MarketChangeStoreResult =
  | { kind: 'changed'; profile: GoalkeeperProfile }
  | { kind: 'refused'; refusal: MarketChangeRefusal }
  | { kind: 'not_a_goalkeeper' };

/**
 * Moves a goalkeeper to another market in ONE transaction (spec 031, research §9): it reads what
 * they still have open, lets `decide` refuse, and only then writes the profile and, across
 * countries, the operating balance's currency. A deposit approved meanwhile conflicts and retries.
 */
export interface IGoalkeeperMarketChangeStore {
  changeMarket(args: {
    userId: string;
    marketId: string;
    zoneIds: string[];
    now: Date;
    /** The new currency when the country changes; `null` within the country. */
    currency: string | null;
    decide: (facts: MarketChangeFacts) => MarketChangeRefusal | null;
  }): Promise<MarketChangeStoreResult>;
}
