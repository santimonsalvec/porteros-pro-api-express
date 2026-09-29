import type { SupportCase } from '../../../../domain/cases/case.js';
import type { Rating } from '../../../../domain/ratings/rating.js';

export interface CaseItem {
  caseId: string;
  type: string;
  status: string;
  bookingId: string;
  requestId: string;
  clientId: string;
  goalkeeperId: string;
  noShowIncidentId: string | null;
  createdAt: string;
  resolution: { by: string; at: string; note: string } | null;
}

export interface CaseDetail extends CaseItem {
  rating: { side: string; answer: boolean; stars: number; comment: string | null; createdAt: string } | null;
  /** Operations sees the location too. */
  checkIn: {
    at: string;
    photoUrl: string;
    location: { latitude: number; longitude: number; accuracyMeters: number | null } | null;
    distanceMeters: number | null;
  } | null;
}

export function toCaseItem(item: SupportCase): CaseItem {
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
    resolution: item.resolution ? { by: item.resolution.by, at: item.resolution.at.toISOString(), note: item.resolution.note } : null,
  };
}

export function toCaseDetail(item: SupportCase, rating: Rating | null): CaseDetail {
  return {
    ...toCaseItem(item),
    rating: rating ? { side: rating.side, answer: rating.answer, stars: rating.stars, comment: rating.comment, createdAt: rating.createdAt.toISOString() } : null,
    checkIn: item.checkIn
      ? { at: new Date(item.checkIn.at).toISOString(), photoUrl: item.checkIn.photoUrl, location: item.checkIn.location, distanceMeters: item.checkIn.distanceMeters }
      : null,
  };
}
