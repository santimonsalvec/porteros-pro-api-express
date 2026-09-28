import { Entity } from '../common/entity.js';
import type { GoalkeeperPrice } from './goalkeeperPrice.js';
import type { GoalkeeperRequest } from './goalkeeperRequest.js';

/**
 * Every state a booking can be in. Only `pending_assignment` is reachable today; the transitions
 * into the others belong to later features (acceptance, expiry, cancellation, withdrawal, close).
 */
export const BOOKING_STATUSES = [
  'pending_assignment',
  'assigned',
  'cancelled',
  'expired',
  'goalkeeper_withdrew',
  'completed',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

interface BookingProps {
  id: string;
  requestId: string;
  clientId: string;
  zoneId: string;
  startsAt: Date;
  status: BookingStatus;
  price: GoalkeeperPrice;
  createdAt: Date;
}

/**
 * One goalkeeper's place in a request. The client, zone and start are copies of the request's,
 * written once and never updated, so later features can query bookings on their own.
 */
export class Booking extends Entity<string> {
  readonly requestId: string;
  readonly clientId: string;
  readonly zoneId: string;
  readonly startsAt: Date;
  readonly status: BookingStatus;
  readonly price: GoalkeeperPrice;
  readonly createdAt: Date;

  private constructor(props: BookingProps) {
    super(props.id);
    if (!BOOKING_STATUSES.includes(props.status)) {
      throw new Error(`Booking: unknown status '${props.status}'`);
    }
    this.requestId = props.requestId;
    this.clientId = props.clientId;
    this.zoneId = props.zoneId;
    this.startsAt = new Date(props.startsAt);
    this.status = props.status;
    this.price = props.price;
    this.createdAt = new Date(props.createdAt);
  }

  /** A new place for one goalkeeper, at the request's per-goalkeeper price, awaiting assignment. */
  static forRequest(id: string, request: GoalkeeperRequest, createdAt: Date): Booking {
    return new Booking({
      id,
      requestId: request.id,
      clientId: request.clientId,
      zoneId: request.zoneId,
      startsAt: request.startsAt,
      status: 'pending_assignment',
      price: request.pricing.perGoalkeeper(),
      createdAt,
    });
  }

  static rehydrate(props: BookingProps): Booking {
    return new Booking(props);
  }
}
