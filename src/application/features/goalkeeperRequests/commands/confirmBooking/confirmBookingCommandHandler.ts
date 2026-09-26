import { validate as isUuid } from 'uuid';
import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type {
  IBookingAuditLogger,
  IBookingRepository,
  IQuoteConfirmationStore,
  IQuoteRepository,
} from '../../common/ports.js';
import { toBookingResponse } from '../../common/bookingResponse.js';
import { Booking } from '../../../../../domain/bookings/booking.js';
import { ConfirmBookingCommand, type ConfirmBookingResult } from './confirmBookingCommand.js';

/**
 * Orchestrates a confirmation (research.md §3). The only atomic step — delete the quote and insert
 * the booking — belongs to the store; every classification rule lives here.
 */
export class ConfirmBookingCommandHandler implements ICommandHandler<
  ConfirmBookingCommand,
  ConfirmBookingResult
> {
  constructor(
    private readonly bookingRepository: IBookingRepository,
    private readonly quoteRepository: IQuoteRepository,
    private readonly store: IQuoteConfirmationStore,
    private readonly idGenerator: IIdGenerator,
    private readonly clock: IClock,
    private readonly audit: IBookingAuditLogger,
  ) {}

  async handle(command: ConfirmBookingCommand): Promise<ConfirmBookingResult> {
    const { clientId, quoteId } = command;
    // One reading of "now" for the whole confirmation: the claim and the expiry check agree.
    const now = this.clock.now();

    // A malformed id cannot name anything: answered without touching the database.
    if (!isUuid(quoteId)) return this.finish(command, { outcome: 'quote_not_found' });

    // (1) A retry or double tap whose booking already exists: answer it without a transaction.
    const existing = await this.bookingRepository.findByQuoteForClient(quoteId, clientId);
    if (existing)
      return this.finish(command, { outcome: 'replayed', booking: toBookingResponse(existing) });

    // (2) The atomic claim: delete the quote and insert its booking, both or neither.
    const claim = await this.store.claimAndBook(quoteId, clientId, now, (quote) =>
      Booking.fromQuote(this.idGenerator.newId(), quote, now),
    );
    switch (claim.kind) {
      case 'booked':
        return this.finish(command, {
          outcome: 'created',
          booking: toBookingResponse(claim.booking),
        });
      case 'duplicate_booking': {
        // The client already booked this match from another quote; this quote is left untouched.
        const other = await this.bookingRepository.findByMatchForClient(
          clientId,
          claim.zoneId,
          claim.startsAt,
        );
        return this.finish(command, {
          outcome: 'duplicate_booking',
          existingBookingId: other?.id ?? null,
        });
      }
      case 'not_claimed':
      case 'already_booked':
        return this.finish(command, await this.classifyUnclaimed(quoteId, clientId, now));
      default: {
        const unreachable: never = claim;
        return unreachable;
      }
    }
  }

  /** (3) Nothing was claimed: find out why. Every lookup is scoped to the caller. */
  private async classifyUnclaimed(
    quoteId: string,
    clientId: string,
    now: Date,
  ): Promise<ConfirmBookingResult> {
    // A concurrent confirmation may have just committed the booking.
    const winner = await this.bookingRepository.findByQuoteForClient(quoteId, clientId);
    if (winner) return { outcome: 'replayed', booking: toBookingResponse(winner) };

    const quote = await this.quoteRepository.findByIdForClient(quoteId, clientId);
    // Past its expiry but not yet removed by the TTL monitor. Left as is: removal is the database's job.
    if (quote?.isExpiredAt(now)) return { outcome: 'quote_expired' };
    // Still valid yet not claimable: another confirmation is committing it right now — safe to retry.
    if (quote) return { outcome: 'confirmation_in_progress' };
    // Never existed, already removed, or another client's — deliberately indistinguishable.
    return { outcome: 'quote_not_found' };
  }

  /** Every confirmation attempt is audited exactly once, whatever its outcome. */
  private finish(
    command: ConfirmBookingCommand,
    result: ConfirmBookingResult,
  ): ConfirmBookingResult {
    this.audit.logBookingConfirmation({
      outcome: result.outcome,
      clientId: command.clientId,
      quoteId: command.quoteId,
      ...('booking' in result ? { bookingId: result.booking.bookingId } : {}),
    });
    return result;
  }
}
