import type { Booking } from '../../../../domain/bookings/booking.js';
import type { GoalkeeperRequest } from '../../../../domain/bookings/goalkeeperRequest.js';
import type { BookingCounts, RequestStatus } from '../../../../domain/bookings/requestStatus.js';
import type { SupportCase } from '../../../../domain/cases/case.js';
import type { GoalkeeperIncident } from '../../../../domain/goalkeepers/goalkeeperIncident.js';
import type { Rating } from '../../../../domain/ratings/rating.js';

/**
 * The admin's reads of requests (admin spec 006, research §6–§8): a list that needs the booking
 * counts, and the facts of one request for its timeline. Read by aggregations and plain finds;
 * nothing here writes.
 */

export interface RequestListFilter {
  /** Match start, `from` included, `to` excluded. */
  from?: Date;
  to?: Date;
  zoneId?: string;
  /** A city, or every city of a country (resolved first). */
  cityIds?: readonly string[];
  clientId?: string;
  /** Only these requests (a goalkeeper's, resolved first). */
  requestIds?: readonly string[];
  status?: RequestStatus;
  page: number;
  pageSize: number;
}

export interface RequestListRecord {
  requestId: string;
  clientId: string;
  startsAt: Date;
  timeZone: string;
  cityId: string;
  zoneId: string;
  goalkeeperCount: number;
  counts: BookingCounts;
  total: number;
  currency: string;
  createdAt: Date;
}

/** What the operating balance says about one booking's commission, read by its cause keys. */
export interface BookingMoneyRecord {
  charged: number;
  chargedVat: number;
  refunded: number;
  refundedVat: number;
  currency: string;
}

export interface RequestDetailRecord {
  request: GoalkeeperRequest;
  bookings: Booking[];
  /** By booking id; absent = no commission was ever charged for it. */
  money: Map<string, BookingMoneyRecord>;
  incidents: GoalkeeperIncident[];
  ratings: Rating[];
  cases: SupportCase[];
  /** Offers still stored (90 days). */
  offersSent: number;
}

export type CheckInPhotoRecord =
  | { outcome: 'ok'; photoUrl: string; at: Date }
  | { outcome: 'request_not_found' }
  | { outcome: 'booking_not_found' }
  | { outcome: 'check_in_not_found' };

export interface IRequestAdminReader {
  /** Every city of a country, through its regions. */
  cityIdsOfCountry(countryId: string): Promise<string[]>;
  /** The requests a goalkeeper ever held a booking of, at most `limit`. */
  requestIdsOfGoalkeeper(goalkeeperId: string, limit: number): Promise<string[]>;
  /** Those of `requestIds` whose match is in one of `cityIds` (a country's cases, admin spec 006 US2). */
  requestIdsInCities(requestIds: readonly string[], cityIds: readonly string[]): Promise<string[]>;
  list(filter: RequestListFilter): Promise<{ items: RequestListRecord[]; totalItems: number }>;
  detail(requestId: string): Promise<RequestDetailRecord | null>;
  /** By case or by request: the booking's check-in photo, the one sensitive read. */
  checkInPhoto(bookingId: string, requestId?: string): Promise<CheckInPhotoRecord>;
}
