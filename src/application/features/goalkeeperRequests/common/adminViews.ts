import type { BookingAttendance, BookingEndedBy, BookingEndReason, BookingStatus } from '../../../../domain/bookings/booking.js';
import type { PartialFulfillment } from '../../../../domain/bookings/goalkeeperRequest.js';
import type { RequestStatus } from '../../../../domain/bookings/requestStatus.js';
import type { MemberRef } from '../../users/common/views.js';

/**
 * What the admin's request screens receive (admin spec 006, contracts/operations-api.md §1–§3):
 * facts, not a timeline — the admin orders them. Never a phone, never the check-in photo.
 */

export interface PersonRef {
  userId: string;
  name: string | null;
}

export interface PlaceRef {
  id: string;
  name: string | null;
}

export interface RequestListItem {
  requestId: string;
  match: { startsAt: string; timeZone: string; market: PlaceRef; zone: PlaceRef };
  client: PersonRef;
  goalkeepersRequested: number;
  goalkeepersAssigned: number;
  status: RequestStatus;
  total: { amount: number; currency: string };
  createdAt: string;
}

/** How a booking's commission was built (feature 033); `null` on records written before it. */
export interface CommissionBreakdownView {
  base: number;
  percentBps: number;
  percentAmount: number;
  fixedAmount: number;
  net: number;
  ruleId: string;
  origin: { scope: 'country' | 'market' | 'zone' | 'goalkeeper'; refId: string; name: string | null };
  modality: string | null;
}

export interface MoneyView {
  charged: number;
  chargedVat: number;
  refunded: number;
  refundedVat: number;
  currency: string;
}

export interface DecisionView {
  at: string;
  by: MemberRef;
  reason: string;
}

export interface IncidentView {
  incidentId: string;
  kind: 'withdrawal' | 'no_show';
  occurredAt: string;
  noticeMinutes: number;
  late: boolean;
  reason: string | null;
  replacementBookingId: string | null;
  penalties: { kind: string; days: number; endsAt: string; reversal: DecisionView | null }[];
  moneyReversal: (DecisionView & { amount: number; currency: string }) | null;
  forgiven: boolean;
}

export interface RatingView {
  ratingId: string;
  side: 'client' | 'goalkeeper';
  authorId: string;
  subjectId: string;
  stars: number;
  answer: boolean;
  comment: string | null;
  createdAt: string;
}

export interface BookingView {
  bookingId: string;
  status: BookingStatus;
  createdAt: string;
  replacesBookingId: string | null;
  searchEndsAt: string;
  goalkeeper: PersonRef | null;
  assignedAt: string | null;
  /** The photo comes only from the audited read (FR-006). */
  checkIn: { at: string; distanceMeters: number | null; accuracyMeters: number | null; onTime: boolean; hasPhoto: true } | null;
  checkInMissedAt: string | null;
  completedAt: string | null;
  attendance: BookingAttendance | null;
  noShowAt: string | null;
  ended: { at: string | null; reason: BookingEndReason | null; by: BookingEndedBy | null; note: string | null; staff: MemberRef | null } | null;
  /** The commission this goalkeeper pays (feature 033): the request's reference, or their own once assigned. */
  commission: number;
  commissionBreakdown: CommissionBreakdownView | null;
  money: MoneyView | null;
  incidents: IncidentView[];
  ratings: RatingView[];
  cases: { caseId: string; type: string; status: string }[];
  /** Admin spec 030: the assigned goalkeeper had no verification seal. */
  unverifiedGoalkeeper?: true;
  /** Admin spec 030: what was taken off the price for that goalkeeper. */
  discount?: number;
}

export interface RequestDetail {
  requestId: string;
  status: RequestStatus;
  quoteIssuedAt: string;
  createdAt: string;
  client: PersonRef;
  match: {
    startsAt: string;
    timeZone: string;
    market: PlaceRef;
    zone: PlaceRef;
    latitude: number;
    longitude: number;
    durationMinutes: number;
    goalkeeperCount: number;
    format: { modality: string; surfaceName: string } | null;
  };
  pricing: { unitRate: number; unitSurcharge: number; subtotal: number; surcharge: number; total: number; currency: string };
  commission: number;
  /** The reference breakdown of one goalkeeper (feature 033); `null` on requests created before it. */
  commissionBreakdown: CommissionBreakdownView | null;
  freeCancellationUntil: string;
  partialFulfillment: PartialFulfillment;
  cancelAllEvaluatedAt: string | null;
  contactsRevealedAt: string | null;
  /** `null` once the offers are no longer stored (90 days). */
  offersSent: number | null;
  bookings: BookingView[];
}
