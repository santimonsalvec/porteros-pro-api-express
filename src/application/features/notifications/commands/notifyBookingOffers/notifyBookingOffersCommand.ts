import { ICommand } from '../../../../common/mediator/types.js';
import type { OfferSendReport } from '../../common/offerSender.js';

export type NotifyBookingOffersResult =
  | { outcome: 'notified'; eligible: number; report: OfferSendReport }
  | { outcome: 'skipped'; reason: 'not_found' | 'not_open' };

/** A new booking's first notification to every goalkeeper who can take it (Story 1). */
export class NotifyBookingOffersCommand extends ICommand<NotifyBookingOffersResult> {
  constructor(readonly bookingId: string) {
    super();
  }
}
