import { IQuery } from '../../../../common/mediator/types.js';
import type { Page } from '../../../geography/common/views.js';
import type { PersonRef, PlaceRef } from '../../../goalkeeperRequests/common/adminViews.js';
import type { RatingListFilter } from '../../common/adminPorts.js';

/** One rating as the admin shows it (contracts/operations-api.md §10). The comment never goes to the logs. */
export interface RatingListItem {
  ratingId: string;
  side: 'client' | 'goalkeeper';
  author: PersonRef & { role: 'client' | 'goalkeeper' };
  subject: PersonRef & { role: 'client' | 'goalkeeper' };
  stars: number;
  /** Client: "did the goalkeeper come?"; goalkeeper: "were you paid?". */
  answer: boolean;
  comment: string | null;
  createdAt: string;
  match: { startsAt: string; timeZone: string; city: PlaceRef } | null;
  requestId: string;
  bookingId: string;
  caseId: string | null;
}

export type ListRatingsAdminResult = { outcome: 'ok'; page: Page<RatingListItem> };

export class ListRatingsAdminQuery extends IQuery<ListRatingsAdminResult> {
  constructor(readonly criteria: RatingListFilter & { page: number; pageSize: number }) {
    super();
  }
}
