import { IQuery } from '../../../../common/mediator/types.js';

export interface PendingRatingItem {
  bookingId: string;
  requestId: string;
  side: 'client' | 'goalkeeper';
  /** What to ask: the client "did your goalkeeper come?", the goalkeeper "were you paid?". */
  question: 'goalkeeper_arrived' | 'payment_received';
  zoneName: string | null;
  cityName: string | null;
  startsAt: string;
  startsAtLocal: string;
  otherParty: { firstName: string | null; lastName: string | null } | null;
  dueUntil: string;
}

export type ListPendingRatingsResult = { outcome: 'ok'; items: PendingRatingItem[] };

/** The caller's ratings still to give, shown when the app opens (no push, feature 021). */
export class ListPendingRatingsQuery extends IQuery<ListPendingRatingsResult> {
  constructor(readonly userId: string) {
    super();
  }
}
