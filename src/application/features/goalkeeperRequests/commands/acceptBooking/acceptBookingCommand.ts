import { ICommand } from '../../../../common/mediator/types.js';
import type { AgendaItem } from '../../common/goalkeeperBookingResponse.js';

export type AcceptBookingResult =
  /** Assigned now; the commission was charged. */
  | { outcome: 'accepted'; booking: AgendaItem }
  /** Already assigned to this goalkeeper (a retry): nothing charged again. */
  | { outcome: 'replayed'; booking: AgendaItem }
  | { outcome: 'already_taken' }
  | { outcome: 'search_ended' }
  | { outcome: 'zone_not_enabled' }
  | { outcome: 'insufficient_funds'; missingAmount: number }
  | { outcome: 'suspended'; suspendedUntil: string }
  /** The goalkeeper's "available for offers" switch is off (feature 015). */
  | { outcome: 'not_available_for_offers' }
  | { outcome: 'schedule_conflict'; conflictingBookingId: string }
  | { outcome: 'own_request' }
  | { outcome: 'same_request' }
  /** Unknown or malformed id, or cancelled, expired or completed. */
  | { outcome: 'not_available' }
  | { outcome: 'not_a_goalkeeper' };

/** The goalkeeper takes a booking: assigned and charged in one step (FR-004). Idempotent per booking. */
export class AcceptBookingCommand extends ICommand<AcceptBookingResult> {
  constructor(
    public readonly goalkeeperId: string,
    public readonly bookingId: string,
  ) {
    super();
  }
}
