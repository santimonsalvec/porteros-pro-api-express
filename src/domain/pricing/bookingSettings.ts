import { Entity } from '../common/entity.js';
import { readRevision } from '../common/revision.js';
import type { CheckInWindowConfig } from '../bookings/checkInWindow.js';
import type { GoalkeeperPenaltyConfig } from '../goalkeepers/penaltyPolicy.js';
import { bookingSettingsIssues } from './bookingSettingsRules.js';
import { InvalidConfigurationError } from './invalidConfigurationError.js';

export type BookingSettingsScope = 'country' | 'market';

/** `fromMinutes` inclusive, `toMinutes` exclusive, `null` = unbounded. */
export interface SurchargeTier {
  fromMinutes: number;
  toMinutes: number | null;
  amount: number;
}

/** Surcharge amounts are in whole units of the country's currency (never stored per tier). */
export interface LeadTimeSurcharge {
  tiers: SurchargeTier[];
}

/**
 * Booking rules and surcharge tiers defined at one level (country or market). Every
 * setting is optional: an absent field means "inherit from the level above", and
 * absent at every level means the area cannot be quoted. Externally seeded, read-only here.
 */
export class BookingSettings extends Entity<string> {
  readonly scope: BookingSettingsScope;
  /** A `Country` id when `scope` is `'country'`; a `Market` id when `'market'`. */
  readonly refId: string;
  /** Today plus the next `N − 1` local calendar days. */
  readonly bookingWindowDays: number | null;
  readonly minNoticeMinutes: number | null;
  readonly leadTimeSurcharge: LeadTimeSurcharge | null;
  /**
   * Minutes before the start during which assigned bookings can no longer be cancelled free.
   * Optional at every level: when absent everywhere a default is used (FR-014), unlike the rest.
   */
  readonly freeCancellationMinutes: number | null;
  /**
   * Minutes a goalkeeper needs to travel between matches; also how long before the start a
   * booking's search ends. Optional at every level: a default applies when absent (FR-010).
   */
  readonly travelBufferMinutes: number | null;
  /**
   * The goalkeeper penalty values (feature 018), set only at the country level (spec 031). Each
   * absent field falls back to the Colombia default.
   */
  readonly goalkeeperPenalties: Partial<GoalkeeperPenaltyConfig> | null;
  /** The check-in window (feature 020); a market may override it (spec 031); absent fields default. */
  readonly checkInWindow: Partial<CheckInWindowConfig> | null;
  /** Minutes after the end to wait for the client's answer before a no-show (feature 021; a market may override it, spec 031). */
  readonly noShowGraceMinutes: number | null;
  /** How often an open offer is pushed again, and how many times (spec 031, FR-017); `null` inherits. */
  readonly offerReminderIntervalMinutes: number | null;
  readonly offerMaxReminders: number | null;

  /** Optimistic-concurrency counter of the admin web (absent = 0). */
  readonly revision: number;
  constructor(params: {
    id: string;
    scope: string;
    refId: string;
    bookingWindowDays?: number | null;
    minNoticeMinutes?: number | null;
    leadTimeSurcharge?: LeadTimeSurcharge | null;
    freeCancellationMinutes?: number | null;
    travelBufferMinutes?: number | null;
    goalkeeperPenalties?: Partial<GoalkeeperPenaltyConfig> | null;
    checkInWindow?: Partial<CheckInWindowConfig> | null;
    noShowGraceMinutes?: number | null;
    offerReminderIntervalMinutes?: number | null;
    offerMaxReminders?: number | null;
    revision?: number;
  }) {
    super(params.id);
    const where = `bookingSettings document ${params.id}`;
    if (params.scope !== 'country' && params.scope !== 'market') {
      throw new InvalidConfigurationError(`${where}: unknown scope '${params.scope}'`);
    }
    if (typeof params.refId !== 'string' || params.refId === '') {
      throw new InvalidConfigurationError(`${where}: refId is required`);
    }
    const bookingWindowDays = params.bookingWindowDays ?? null;
    const minNoticeMinutes = params.minNoticeMinutes ?? null;
    const freeCancellationMinutes = params.freeCancellationMinutes ?? null;
    const travelBufferMinutes = params.travelBufferMinutes ?? null;
    const leadTimeSurcharge = params.leadTimeSurcharge ?? null;
    const goalkeeperPenalties = params.goalkeeperPenalties ?? null;
    const checkInWindow = params.checkInWindow ?? null;
    const noShowGraceMinutes = params.noShowGraceMinutes ?? null;
    const offerReminderIntervalMinutes = params.offerReminderIntervalMinutes ?? null;
    const offerMaxReminders = params.offerMaxReminders ?? null;
    const [first] = bookingSettingsIssues(
      {
      bookingWindowDays,
      minNoticeMinutes,
      freeCancellationMinutes,
      travelBufferMinutes,
      leadTimeSurcharge,
      goalkeeperPenalties,
      checkInWindow,
      noShowGraceMinutes,
      offerReminderIntervalMinutes,
      offerMaxReminders,
      },
      params.scope,
    );
    if (first) throw new InvalidConfigurationError(`${where}: ${first.path} ${first.code}: ${first.message}`);

    this.scope = params.scope;
    this.refId = params.refId;
    this.bookingWindowDays = bookingWindowDays;
    this.minNoticeMinutes = minNoticeMinutes;
    this.leadTimeSurcharge = leadTimeSurcharge;
    this.freeCancellationMinutes = freeCancellationMinutes;
    this.travelBufferMinutes = travelBufferMinutes;
    this.goalkeeperPenalties = goalkeeperPenalties;
    this.checkInWindow = checkInWindow;
    this.noShowGraceMinutes = noShowGraceMinutes;
    this.offerReminderIntervalMinutes = offerReminderIntervalMinutes;
    this.offerMaxReminders = offerMaxReminders;
    this.revision = readRevision(params.revision, where);
  }
}
