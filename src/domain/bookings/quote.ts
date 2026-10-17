import { Entity } from '../common/entity.js';
import type { MatchDetails } from './matchDetails.js';
import type { PricingSnapshot } from './pricingSnapshot.js';
import type { CommissionBreakdown } from '../operatingBalance/commissionRule.js';

export type QuoteStatus = 'pending';

interface QuoteProps {
  id: string;
  clientId: string;
  match: MatchDetails;
  pricing: PricingSnapshot;
  issuedAt: Date;
  expiresAt: Date;
  /** Minutes before the start during which assigned bookings can no longer be cancelled free. */
  freeCancellationMinutes: number;
  /** The platform's commission for one goalkeeper, fixed for the whole flow (012, clarification 1). */
  commission: number;
  /** How that commission was built (feature 033); `null` on quotes stored before it. */
  commissionBreakdown?: CommissionBreakdown | null;
  /** Minutes a goalkeeper needs to travel between matches here (012, FR-010). */
  travelBufferMinutes: number;
  /** Admin spec 030: the zone's discount for a goalkeeper without the seal (basis points); absent = 0. */
  unverifiedDiscountBps?: number;
  /** Admin spec 030: how long the bookings wait for verified goalkeepers; absent = 0. */
  verifiedPriorityMinutes?: number;
}

/**
 * A price offer to one client for one match. It only exists while it can be confirmed: the
 * confirmation deletes it, and the database removes it once `expiresAt` has passed. So a stored
 * quote is always `pending` — "consumed" and "expired" are not stored states.
 */
export class Quote extends Entity<string> {
  readonly clientId: string;
  readonly status: QuoteStatus = 'pending';
  readonly match: MatchDetails;
  readonly pricing: PricingSnapshot;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  /** Resolved from the booking settings when quoting, so confirmation never re-reads them. */
  readonly freeCancellationMinutes: number;
  readonly commission: number;
  /** The reference breakdown, from the geography levels (the goalkeeper is unknown here, FR-012). */
  readonly commissionBreakdown: CommissionBreakdown | null;
  readonly travelBufferMinutes: number;
  /** Fixed with the price, so what the client saw is what applies (FR-019). */
  readonly unverifiedDiscountBps: number;
  readonly verifiedPriorityMinutes: number;

  private constructor(props: QuoteProps) {
    super(props.id);
    if (!props.clientId) throw new Error('Quote: clientId is required');
    if (props.expiresAt.getTime() <= props.issuedAt.getTime()) {
      throw new Error('Quote: expiresAt must be after issuedAt');
    }
    if (!Number.isInteger(props.freeCancellationMinutes) || props.freeCancellationMinutes < 0) {
      throw new Error('Quote: freeCancellationMinutes must be an integer of at least 0');
    }
    if (!Number.isInteger(props.commission) || props.commission <= 0) {
      throw new Error('Quote: commission must be a positive integer');
    }
    if (!Number.isInteger(props.travelBufferMinutes) || props.travelBufferMinutes < 0) {
      throw new Error('Quote: travelBufferMinutes must be an integer of at least 0');
    }
    if (props.commissionBreakdown && props.commissionBreakdown.net !== props.commission) {
      throw new Error('Quote: commission must equal commissionBreakdown.net');
    }
    this.clientId = props.clientId;
    this.match = props.match;
    this.pricing = props.pricing;
    this.issuedAt = new Date(props.issuedAt);
    this.expiresAt = new Date(props.expiresAt);
    this.freeCancellationMinutes = props.freeCancellationMinutes;
    this.commission = props.commission;
    this.commissionBreakdown = props.commissionBreakdown ?? null;
    this.travelBufferMinutes = props.travelBufferMinutes;
    this.unverifiedDiscountBps = props.unverifiedDiscountBps ?? 0;
    this.verifiedPriorityMinutes = props.verifiedPriorityMinutes ?? 0;
  }

  static issue(
    id: string,
    clientId: string,
    match: MatchDetails,
    pricing: PricingSnapshot,
    issuedAt: Date,
    validityMinutes: number,
    freeCancellationMinutes: number,
    commission: number,
    travelBufferMinutes: number,
    unverified: { discountBps: number; verifiedPriorityMinutes: number } = { discountBps: 0, verifiedPriorityMinutes: 0 },
    commissionBreakdown: CommissionBreakdown | null = null,
  ): Quote {
    const expiresAt = new Date(issuedAt.getTime() + validityMinutes * 60_000);
    return new Quote({
      id,
      clientId,
      match,
      pricing,
      issuedAt,
      expiresAt,
      freeCancellationMinutes,
      commission,
      commissionBreakdown,
      travelBufferMinutes,
      unverifiedDiscountBps: unverified.discountBps,
      verifiedPriorityMinutes: unverified.verifiedPriorityMinutes,
    });
  }

  static rehydrate(props: QuoteProps): Quote {
    return new Quote(props);
  }

  /** Confirmable only strictly before `expiresAt`. */
  /**
   * "Cancel all" can only be chosen strictly before this instant, the end of the free-cancellation
   * period, when a "cancel all" request is evaluated (feature 016, clarification 1).
   */
  cancelAllUntil(): Date {
    return new Date(this.match.startsAt.getTime() - this.freeCancellationMinutes * 60_000);
  }

  isCancelAllAvailableAt(now: Date): boolean {
    return now.getTime() < this.cancelAllUntil().getTime();
  }

  isExpiredAt(now: Date): boolean {
    return this.expiresAt.getTime() <= now.getTime();
  }
}
