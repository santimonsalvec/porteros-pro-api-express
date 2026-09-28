import { Entity } from '../common/entity.js';
import { InvalidConfigurationError } from './invalidConfigurationError.js';

export type BookingSettingsScope = 'country' | 'city';

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
 * Booking rules and surcharge tiers defined at one level (country or city). Every
 * setting is optional: an absent field means "inherit from the level above", and
 * absent at every level means the area cannot be quoted. Externally seeded, read-only here.
 */
export class BookingSettings extends Entity<string> {
  readonly scope: BookingSettingsScope;
  /** A `Country` id when `scope` is `'country'`; an anchor `City` id when `'city'`. */
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

  constructor(params: {
    id: string;
    scope: string;
    refId: string;
    bookingWindowDays?: number | null;
    minNoticeMinutes?: number | null;
    leadTimeSurcharge?: LeadTimeSurcharge | null;
    freeCancellationMinutes?: number | null;
    travelBufferMinutes?: number | null;
  }) {
    super(params.id);
    const where = `bookingSettings document ${params.id}`;
    if (params.scope !== 'country' && params.scope !== 'city') {
      throw new InvalidConfigurationError(`${where}: unknown scope '${params.scope}'`);
    }
    if (typeof params.refId !== 'string' || params.refId === '') {
      throw new InvalidConfigurationError(`${where}: refId is required`);
    }
    const bookingWindowDays = params.bookingWindowDays ?? null;
    if (bookingWindowDays !== null && (!Number.isInteger(bookingWindowDays) || bookingWindowDays < 1)) {
      throw new InvalidConfigurationError(`${where}: bookingWindowDays must be an integer of at least 1`);
    }
    const minNoticeMinutes = params.minNoticeMinutes ?? null;
    if (minNoticeMinutes !== null && (!Number.isInteger(minNoticeMinutes) || minNoticeMinutes < 0)) {
      throw new InvalidConfigurationError(`${where}: minNoticeMinutes must be an integer of at least 0`);
    }
    const freeCancellationMinutes = params.freeCancellationMinutes ?? null;
    if (
      freeCancellationMinutes !== null &&
      (!Number.isInteger(freeCancellationMinutes) || freeCancellationMinutes < 0)
    ) {
      throw new InvalidConfigurationError(`${where}: freeCancellationMinutes must be an integer of at least 0`);
    }
    const travelBufferMinutes = params.travelBufferMinutes ?? null;
    if (travelBufferMinutes !== null && (!Number.isInteger(travelBufferMinutes) || travelBufferMinutes < 0)) {
      throw new InvalidConfigurationError(`${where}: travelBufferMinutes must be an integer of at least 0`);
    }
    const leadTimeSurcharge = params.leadTimeSurcharge ?? null;
    if (leadTimeSurcharge !== null) validateSurcharge(leadTimeSurcharge, where);

    this.scope = params.scope;
    this.refId = params.refId;
    this.bookingWindowDays = bookingWindowDays;
    this.minNoticeMinutes = minNoticeMinutes;
    this.leadTimeSurcharge = leadTimeSurcharge;
    this.freeCancellationMinutes = freeCancellationMinutes;
    this.travelBufferMinutes = travelBufferMinutes;
  }
}

function validateSurcharge(surcharge: LeadTimeSurcharge, where: string): void {
  if (!Array.isArray(surcharge.tiers) || surcharge.tiers.length === 0) {
    throw new InvalidConfigurationError(`${where}: leadTimeSurcharge.tiers must be a non-empty array`);
  }
  let previousEnd: number | null = 0;
  surcharge.tiers.forEach((tier, index) => {
    if (!Number.isFinite(tier.fromMinutes) || tier.fromMinutes < 0) {
      throw new InvalidConfigurationError(`${where}: tier ${index} fromMinutes must be at least 0`);
    }
    if (tier.toMinutes !== null && (!Number.isFinite(tier.toMinutes) || tier.toMinutes <= tier.fromMinutes)) {
      throw new InvalidConfigurationError(`${where}: tier ${index} toMinutes must be greater than fromMinutes`);
    }
    if (!Number.isInteger(tier.amount) || tier.amount < 0) {
      throw new InvalidConfigurationError(`${where}: tier ${index} amount must be an integer of at least 0`);
    }
    // Sorted and non-overlapping; gaps are allowed (they yield no surcharge).
    if (previousEnd === null) {
      throw new InvalidConfigurationError(`${where}: only the last tier may be unbounded`);
    }
    if (index > 0 && tier.fromMinutes < previousEnd) {
      throw new InvalidConfigurationError(`${where}: tiers must be sorted and must not overlap`);
    }
    previousEnd = tier.toMinutes;
  });
}
