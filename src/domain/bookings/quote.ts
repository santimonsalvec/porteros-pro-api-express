import { Entity } from '../common/entity.js';
import type { MatchDetails } from './matchDetails.js';
import type { PricingSnapshot } from './pricingSnapshot.js';

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

  private constructor(props: QuoteProps) {
    super(props.id);
    if (!props.clientId) throw new Error('Quote: clientId is required');
    if (props.expiresAt.getTime() <= props.issuedAt.getTime()) {
      throw new Error('Quote: expiresAt must be after issuedAt');
    }
    if (!Number.isInteger(props.freeCancellationMinutes) || props.freeCancellationMinutes < 0) {
      throw new Error('Quote: freeCancellationMinutes must be an integer of at least 0');
    }
    this.clientId = props.clientId;
    this.match = props.match;
    this.pricing = props.pricing;
    this.issuedAt = new Date(props.issuedAt);
    this.expiresAt = new Date(props.expiresAt);
    this.freeCancellationMinutes = props.freeCancellationMinutes;
  }

  static issue(
    id: string,
    clientId: string,
    match: MatchDetails,
    pricing: PricingSnapshot,
    issuedAt: Date,
    validityMinutes: number,
    freeCancellationMinutes: number,
  ): Quote {
    const expiresAt = new Date(issuedAt.getTime() + validityMinutes * 60_000);
    return new Quote({ id, clientId, match, pricing, issuedAt, expiresAt, freeCancellationMinutes });
  }

  static rehydrate(props: QuoteProps): Quote {
    return new Quote(props);
  }

  /** Confirmable only strictly before `expiresAt`. */
  isExpiredAt(now: Date): boolean {
    return this.expiresAt.getTime() <= now.getTime();
  }
}
