import { Entity } from '../common/entity.js';
import type { MatchDetails } from './matchDetails.js';
import type { PricingSnapshot } from './pricingSnapshot.js';
import type { Quote } from './quote.js';

/** Confirmed, awaiting goalkeeper assignment — the only status until assignment exists. */
export type BookingStatus = 'pending_assignment';

interface BookingProps {
  id: string;
  clientId: string;
  quoteId: string;
  status: BookingStatus;
  match: MatchDetails;
  pricing: PricingSnapshot;
  quoteIssuedAt: Date;
  createdAt: Date;
}

/**
 * A client's confirmed request for goalkeepers for one match, created from exactly one quote.
 * The quote is deleted when the booking is created, so the booking is the only lasting record
 * of what the client accepted: its match and price are copies, never recalculated.
 */
export class Booking extends Entity<string> {
  readonly clientId: string;
  readonly quoteId: string;
  readonly status: BookingStatus;
  readonly match: MatchDetails;
  readonly pricing: PricingSnapshot;
  readonly quoteIssuedAt: Date;
  readonly createdAt: Date;

  private constructor(props: BookingProps) {
    super(props.id);
    this.clientId = props.clientId;
    this.quoteId = props.quoteId;
    this.status = props.status;
    this.match = props.match;
    this.pricing = props.pricing;
    this.quoteIssuedAt = new Date(props.quoteIssuedAt);
    this.createdAt = new Date(props.createdAt);
  }

  static fromQuote(id: string, quote: Quote, createdAt: Date): Booking {
    return new Booking({
      id,
      clientId: quote.clientId,
      quoteId: quote.id,
      status: 'pending_assignment',
      match: quote.match,
      pricing: quote.pricing,
      quoteIssuedAt: quote.issuedAt,
      createdAt,
    });
  }

  static rehydrate(props: BookingProps): Booking {
    return new Booking(props);
  }

  /** The zone and start a client may hold only one booking for. */
  get zoneId(): string {
    return this.match.zoneId;
  }

  get startsAt(): Date {
    return this.match.startsAt;
  }
}
