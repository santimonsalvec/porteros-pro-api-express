import { Entity } from '../common/entity.js';
import type { MatchDetails } from './matchDetails.js';
import type { PricingSnapshot } from './pricingSnapshot.js';
import type { Quote } from './quote.js';

/** What happens if only some of the requested goalkeepers are confirmed (applied by a later feature). */
export const PARTIAL_FULFILLMENT_OPTIONS = ['keep_confirmed', 'cancel_all'] as const;
export type PartialFulfillment = (typeof PARTIAL_FULFILLMENT_OPTIONS)[number];
export const PARTIAL_FULFILLMENT_DEFAULT: PartialFulfillment = 'keep_confirmed';

interface GoalkeeperRequestProps {
  id: string;
  clientId: string;
  quoteId: string;
  match: MatchDetails;
  pricing: PricingSnapshot;
  partialFulfillment: PartialFulfillment;
  freeCancellationMinutes: number;
  commission: number;
  travelBufferMinutes: number;
  active: boolean;
  quoteIssuedAt: Date;
  createdAt: Date;
  /** When the "cancel all" evaluation ran (feature 016); absent on older documents. */
  cancelAllEvaluatedAt?: Date | null;
}

/**
 * The match a client asked goalkeepers for, created from exactly one quote. Each goalkeeper is a
 * separate `Booking` referencing it. `active` is stored (not derived) only because the
 * one-active-request-per-match unique index needs it; later features clear it when no booking
 * of the request is pending or assigned any more.
 */
export class GoalkeeperRequest extends Entity<string> {
  readonly clientId: string;
  readonly quoteId: string;
  readonly match: MatchDetails;
  /** The quoted price for all the goalkeepers of the request. */
  readonly pricing: PricingSnapshot;
  readonly partialFulfillment: PartialFulfillment;
  readonly freeCancellationMinutes: number;
  /** Set once by the "cancel all" evaluation, whatever its outcome (feature 016). */
  readonly cancelAllEvaluatedAt: Date | null;
  /** Fixed at quote time; copied to each booking (012, clarification 1). */
  readonly commission: number;
  readonly travelBufferMinutes: number;
  readonly active: boolean;
  readonly quoteIssuedAt: Date;
  readonly createdAt: Date;

  private constructor(props: GoalkeeperRequestProps) {
    super(props.id);
    if (!PARTIAL_FULFILLMENT_OPTIONS.includes(props.partialFulfillment)) {
      throw new Error(`GoalkeeperRequest: unknown partialFulfillment '${props.partialFulfillment}'`);
    }
    this.clientId = props.clientId;
    this.quoteId = props.quoteId;
    this.match = props.match;
    this.pricing = props.pricing;
    this.partialFulfillment = props.partialFulfillment;
    this.freeCancellationMinutes = props.freeCancellationMinutes;
    this.commission = props.commission;
    this.travelBufferMinutes = props.travelBufferMinutes;
    this.active = props.active;
    this.quoteIssuedAt = new Date(props.quoteIssuedAt);
    this.createdAt = new Date(props.createdAt);
    this.cancelAllEvaluatedAt = props.cancelAllEvaluatedAt ? new Date(props.cancelAllEvaluatedAt) : null;
  }

  static fromQuote(
    id: string,
    quote: Quote,
    partialFulfillment: PartialFulfillment,
    createdAt: Date,
  ): GoalkeeperRequest {
    return new GoalkeeperRequest({
      id,
      clientId: quote.clientId,
      quoteId: quote.id,
      match: quote.match,
      pricing: quote.pricing,
      partialFulfillment,
      freeCancellationMinutes: quote.freeCancellationMinutes,
      commission: quote.commission,
      travelBufferMinutes: quote.travelBufferMinutes,
      active: true,
      quoteIssuedAt: quote.issuedAt,
      createdAt,
    });
  }

  static rehydrate(props: GoalkeeperRequestProps): GoalkeeperRequest {
    return new GoalkeeperRequest(props);
  }

  get zoneId(): string {
    return this.match.zoneId;
  }

  get startsAt(): Date {
    return this.match.startsAt;
  }

  get goalkeeperCount(): 1 | 2 {
    return this.match.goalkeeperCount;
  }

  /** After this instant, assigned bookings can no longer be cancelled free of charge. */
  freeCancellationUntil(): Date {
    return new Date(this.startsAt.getTime() - this.freeCancellationMinutes * 60_000);
  }

  /**
   * When a "cancel all" request is evaluated (feature 016): the end of the free-cancellation
   * period. "Cancel all" can only be chosen strictly before it (clarification 1).
   */
  cancelAllUntil(): Date {
    return this.freeCancellationUntil();
  }

  /** Inclusive: exactly at `freeCancellationUntil()` cancellation is still free. */
  canCancelFreeAt(now: Date): boolean {
    return now.getTime() <= this.freeCancellationUntil().getTime();
  }
}
