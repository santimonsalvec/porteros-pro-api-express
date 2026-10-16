import type { SupportCase } from '../../../../domain/cases/case.js';
import type { Rating } from '../../../../domain/ratings/rating.js';
import type { GoalkeeperRequest } from '../../../../domain/bookings/goalkeeperRequest.js';
import { personNames, placeNames } from '../../goalkeeperRequests/common/adminNames.js';
import type { BookingView, PersonRef, PlaceRef } from '../../goalkeeperRequests/common/adminViews.js';
import { memberRef } from '../../users/common/userViewing.js';
import type { MemberRef } from '../../users/common/views.js';
import type { CasesAdminDependencies } from './casesAdminDependencies.js';

/**
 * A case as the admin shows it (admin spec 006, contracts/operations-api.md §6–§7): 021's fields
 * plus its match and the names; the resolution names the member. Never the check-in photo.
 */
export interface CaseAdminItem {
  caseId: string;
  type: string;
  status: string;
  bookingId: string;
  requestId: string;
  clientId: string;
  goalkeeperId: string;
  noShowIncidentId: string | null;
  createdAt: string;
  resolution: { by: MemberRef; at: string; note: string } | null;
  match: { startsAt: string; timeZone: string; market: PlaceRef; zone: PlaceRef } | null;
  client: PersonRef;
  goalkeeper: PersonRef;
}

export interface CaseAdminDetail extends CaseAdminItem {
  rating: { side: string; answer: boolean; stars: number; comment: string | null; createdAt: string } | null;
  checkIn: { at: string; distanceMeters: number | null; hasPhoto: true } | null;
  booking: BookingView | null;
  requestStatus: string | null;
}

/** The items of a page of cases, with their matches and names looked up once. */
export async function caseItems(deps: CasesAdminDependencies, cases: readonly SupportCase[]): Promise<CaseAdminItem[]> {
  const requests = cases.length > 0 ? await deps.requests.findByIds([...new Set(cases.map((item) => item.requestId))]) : [];
  const requestsById = new Map(requests.map((request) => [request.id, request]));
  const [people, places, members] = await Promise.all([
    personNames(deps, cases.flatMap((item) => [item.clientId, item.goalkeeperId])),
    placeNames(deps, requests.map((request) => request.match.marketId), requests.map((request) => request.zoneId)),
    resolvers(deps, cases),
  ]);
  return cases.map((item) => {
    const request = requestsById.get(item.requestId);
    return {
      caseId: item.id,
      type: item.type,
      status: item.status,
      bookingId: item.bookingId,
      requestId: item.requestId,
      clientId: item.clientId,
      goalkeeperId: item.goalkeeperId,
      noShowIncidentId: item.noShowIncidentId,
      createdAt: item.createdAt.toISOString(),
      resolution: item.resolution
        ? { by: members.get(item.resolution.by)!, at: new Date(item.resolution.at).toISOString(), note: item.resolution.note }
        : null,
      match: request ? matchOf(request, places) : null,
      client: people(item.clientId),
      goalkeeper: people(item.goalkeeperId),
    };
  });
}

export function ratingView(rating: Rating | null): CaseAdminDetail['rating'] {
  return rating ? { side: rating.side, answer: rating.answer, stars: rating.stars, comment: rating.comment, createdAt: rating.createdAt.toISOString() } : null;
}

function matchOf(request: GoalkeeperRequest, places: { market: (id: string) => PlaceRef; zone: (id: string) => PlaceRef }): CaseAdminItem['match'] {
  return {
    startsAt: request.startsAt.toISOString(),
    timeZone: request.match.timeZone,
    market: places.market(request.match.marketId),
    zone: places.zone(request.zoneId),
  };
}

async function resolvers(deps: CasesAdminDependencies, cases: readonly SupportCase[]): Promise<Map<string, MemberRef>> {
  const ids = [...new Set(cases.flatMap((item) => (item.resolution ? [item.resolution.by] : [])))];
  const refs = await Promise.all(ids.map((id) => memberRef(deps.staff, id)));
  return new Map(refs.flatMap((ref) => (ref ? [[ref.userId, ref] as const] : [])));
}
