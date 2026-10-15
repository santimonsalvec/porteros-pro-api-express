import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { Booking } from '../../../../../domain/bookings/booking.js';
import { requestStatusOf } from '../../../../../domain/bookings/requestStatus.js';
import type { AdminDecision, GoalkeeperIncident } from '../../../../../domain/goalkeepers/goalkeeperIncident.js';
import { memberRef } from '../../../users/common/userViewing.js';
import type { MemberRef } from '../../../users/common/views.js';
import { personNames, placeNames } from '../../common/adminNames.js';
import type { BookingView, DecisionView, IncidentView, PersonRef } from '../../common/adminViews.js';
import type { RequestDetailRecord } from '../../common/adminPorts.js';
import type { RequestsAdminDependencies } from '../../common/requestsAdminDependencies.js';
import { GetRequestAdminQuery, type GetRequestAdminResult } from './getRequestAdminQuery.js';

/** How long offers stay in the inbox (`notifications.created_ttl`): older requests no longer know them. */
const OFFERS_KEPT_MS = 90 * 24 * 60 * 60 * 1000;

const iso = (date: Date | null) => date?.toISOString() ?? null;

export class GetRequestAdminQueryHandler implements IQueryHandler<GetRequestAdminQuery, GetRequestAdminResult> {
  constructor(private readonly deps: RequestsAdminDependencies) {}

  async handle({ requestId }: GetRequestAdminQuery): Promise<GetRequestAdminResult> {
    const record = await this.deps.reader.detail(requestId);
    if (!record) return { outcome: 'request_not_found' };
    const { request, bookings } = record;

    const goalkeeperIds = bookings.flatMap((booking) => (booking.goalkeeperId ? [booking.goalkeeperId] : []));
    const [people, places, members] = await Promise.all([
      personNames(this.deps, [request.clientId, ...goalkeeperIds]),
      placeNames(this.deps, [request.match.cityId], [request.zoneId]),
      this.members(record),
    ]);
    const offersForgotten = record.offersSent === 0 && this.deps.clock.now().getTime() - request.createdAt.getTime() > OFFERS_KEPT_MS;
    const format = request.match.format;

    return {
      outcome: 'ok',
      request: {
        requestId: request.id,
        status: requestStatusOf(bookings),
        quoteIssuedAt: request.quoteIssuedAt.toISOString(),
        createdAt: request.createdAt.toISOString(),
        client: people(request.clientId),
        match: {
          startsAt: request.startsAt.toISOString(),
          timeZone: request.match.timeZone,
          city: places.city(request.match.cityId),
          zone: places.zone(request.zoneId),
          latitude: request.match.latitude,
          longitude: request.match.longitude,
          durationMinutes: request.match.durationMinutes,
          goalkeeperCount: request.match.goalkeeperCount,
          format: format ? { modality: format.modality, level: format.level, surfaceName: format.surfaceName } : null,
        },
        pricing: {
          unitRate: request.pricing.unitRate,
          unitSurcharge: request.pricing.unitSurcharge,
          subtotal: request.pricing.subtotal,
          surcharge: request.pricing.surcharge,
          total: request.pricing.total,
          currency: request.pricing.currency,
        },
        commission: request.commission,
        freeCancellationUntil: request.freeCancellationUntil().toISOString(),
        partialFulfillment: request.partialFulfillment,
        cancelAllEvaluatedAt: iso(request.cancelAllEvaluatedAt),
        contactsRevealedAt: iso(request.contactsRevealedAt),
        offersSent: offersForgotten ? null : record.offersSent,
        bookings: bookings.map((booking) => this.bookingView(booking, record, people, members)),
      },
    };
  }

  private bookingView(
    booking: Booking,
    record: RequestDetailRecord,
    people: (id: string) => PersonRef,
    members: Map<string, MemberRef>,
  ): BookingView {
    const ended = booking.endedAt || booking.endReason || booking.cancelledBy;
    return {
      bookingId: booking.id,
      status: booking.status,
      createdAt: booking.createdAt.toISOString(),
      replacesBookingId: booking.replacesBookingId,
      searchEndsAt: booking.searchEndsAt.toISOString(),
      goalkeeper: booking.goalkeeperId ? people(booking.goalkeeperId) : null,
      assignedAt: iso(booking.assignedAt),
      // Admin spec 030: a goalkeeper without the seal, and what was taken off; absent otherwise.
      ...(booking.goalkeeperVerified === false ? { unverifiedGoalkeeper: true as const } : {}),
      ...(booking.price.discount > 0 ? { discount: booking.price.discount } : {}),
      checkIn: booking.checkIn
        ? {
            at: booking.checkIn.at.toISOString(),
            distanceMeters: booking.checkIn.distanceMeters,
            accuracyMeters: booking.checkIn.location?.accuracyMeters ?? null,
            onTime: booking.checkIn.at.getTime() <= booking.startsAt.getTime(),
            hasPhoto: true,
          }
        : null,
      checkInMissedAt: iso(booking.checkInMissedAt),
      completedAt: iso(booking.completedAt),
      attendance: booking.attendance,
      noShowAt: iso(booking.noShowAt),
      ended: ended
        ? {
            at: iso(booking.endedAt),
            reason: booking.endReason,
            by: booking.cancelledBy,
            note: booking.cancellationNote,
            staff: booking.cancelledByStaffId ? (members.get(booking.cancelledByStaffId) ?? null) : null,
          }
        : null,
      money: record.money.get(booking.id) ?? null,
      incidents: record.incidents.filter((incident) => incident.bookingId === booking.id).map((incident) => incidentView(incident, members)),
      ratings: record.ratings
        .filter((rating) => rating.bookingId === booking.id)
        .map((rating) => ({
          ratingId: rating.id,
          side: rating.side,
          authorId: rating.authorId,
          subjectId: rating.subjectId,
          stars: rating.stars,
          answer: rating.answer,
          comment: rating.comment,
          createdAt: rating.createdAt.toISOString(),
        })),
      cases: record.cases.filter((item) => item.bookingId === booking.id).map((item) => ({ caseId: item.id, type: item.type, status: item.status })),
    };
  }

  /** Every staff member named by a cancellation or a reversal, looked up once. */
  private async members(record: RequestDetailRecord): Promise<Map<string, MemberRef>> {
    const ids = new Set<string>();
    for (const booking of record.bookings) if (booking.cancelledByStaffId) ids.add(booking.cancelledByStaffId);
    for (const incident of record.incidents) {
      for (const penalty of incident.penalties) if (penalty.reversal) ids.add(penalty.reversal.by);
      if (incident.moneyReversal) ids.add(incident.moneyReversal.by);
    }
    const refs = await Promise.all([...ids].map((id) => memberRef(this.deps.staff, id)));
    return new Map(refs.flatMap((ref) => (ref ? [[ref.userId, ref] as const] : [])));
  }
}

function decision(value: AdminDecision, members: Map<string, MemberRef>): DecisionView {
  return { at: value.at.toISOString(), by: members.get(value.by) ?? { userId: value.by, name: 'Miembro del equipo' }, reason: value.reason };
}

function incidentView(incident: GoalkeeperIncident, members: Map<string, MemberRef>): IncidentView {
  return {
    incidentId: incident.id,
    kind: incident.kind,
    occurredAt: incident.occurredAt.toISOString(),
    noticeMinutes: incident.noticeMinutes,
    late: incident.late,
    reason: incident.reason,
    replacementBookingId: incident.replacementBookingId,
    penalties: incident.penalties.map((penalty) => ({
      kind: penalty.kind,
      days: penalty.days,
      endsAt: penalty.endsAt.toISOString(),
      reversal: penalty.reversal ? decision(penalty.reversal, members) : null,
    })),
    moneyReversal: incident.moneyReversal
      ? { ...decision(incident.moneyReversal, members), amount: incident.moneyReversal.amount, currency: incident.moneyReversal.currency }
      : null,
    forgiven: incident.forgivenAt !== null,
  };
}
