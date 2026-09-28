import { validate as isUuid } from 'uuid';
import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator, IUserRepository } from '../../../auth/common/ports.js';
import type {
  IBookingAuditLogger,
  IBookingRepository,
  IGoalkeeperRequestRepository,
  IQuoteConfirmationStore,
  IQuoteRepository,
} from '../../common/ports.js';
import { loadContacts } from '../../common/contacts.js';
import { assignedGoalkeeperIds, toRequestResponse } from '../../common/requestResponse.js';
import { Booking } from '../../../../../domain/bookings/booking.js';
import { GoalkeeperRequest } from '../../../../../domain/bookings/goalkeeperRequest.js';
import { ConfirmBookingCommand, type ConfirmBookingResult } from './confirmBookingCommand.js';

/**
 * Orchestrates a confirmation (research.md §8, 008 research §3). The only atomic step — delete the
 * quote and insert the request with its bookings — belongs to the store; every classification rule
 * lives here.
 */
export class ConfirmBookingCommandHandler implements ICommandHandler<
  ConfirmBookingCommand,
  ConfirmBookingResult
> {
  constructor(
    private readonly requestRepository: IGoalkeeperRequestRepository,
    private readonly bookingRepository: IBookingRepository,
    private readonly userRepository: IUserRepository,
    private readonly quoteRepository: IQuoteRepository,
    private readonly store: IQuoteConfirmationStore,
    private readonly idGenerator: IIdGenerator,
    private readonly clock: IClock,
    private readonly audit: IBookingAuditLogger,
  ) {}

  async handle(command: ConfirmBookingCommand): Promise<ConfirmBookingResult> {
    const { clientId, quoteId } = command;
    // One reading of "now" for the whole confirmation: the claim, the expiry check and the
    // free-cancellation answer agree.
    const now = this.clock.now();

    // A malformed id cannot name anything: answered without touching the database.
    if (!isUuid(quoteId)) return this.finish(command, { outcome: 'quote_not_found' });

    // (1) A retry or double tap whose request already exists: answer it without a transaction.
    const replay = await this.replay(quoteId, clientId, now);
    if (replay) return this.finish(command, replay);

    // (2) The atomic claim: delete the quote and insert the request with its bookings, all or nothing.
    const claim = await this.store.claimAndCreateRequest(quoteId, clientId, now, (quote) => {
      const request = GoalkeeperRequest.fromQuote(this.idGenerator.newId(), quote, command.partialFulfillment, now);
      const bookings = Array.from({ length: request.goalkeeperCount }, () =>
        Booking.forRequest(this.idGenerator.newId(), request, now),
      );
      return { request, bookings };
    });
    switch (claim.kind) {
      case 'created':
        return this.finish(command, {
          outcome: 'created',
          request: toRequestResponse(claim.request, claim.bookings, now),
        });
      case 'duplicate_request': {
        // The client already has this match from another quote; this quote is left untouched.
        const other = await this.requestRepository.findActiveByMatchForClient(clientId, claim.zoneId, claim.startsAt);
        return this.finish(command, { outcome: 'duplicate_request', existingRequestId: other?.id ?? null });
      }
      case 'not_claimed':
      case 'already_requested':
        return this.finish(command, await this.classifyUnclaimed(quoteId, clientId, now));
      default: {
        const unreachable: never = claim;
        return unreachable;
      }
    }
  }

  /**
   * The existing request of this quote, with its bookings as they are now — never a stored copy —
   * and the contacts of whoever has taken them since.
   */
  private async replay(quoteId: string, clientId: string, now: Date): Promise<ConfirmBookingResult | null> {
    const request = await this.requestRepository.findByQuoteForClient(quoteId, clientId);
    if (!request) return null;
    const bookings = await this.bookingRepository.findByRequestIds([request.id]);
    const contacts = await loadContacts(this.userRepository, assignedGoalkeeperIds(bookings));
    return { outcome: 'replayed', request: toRequestResponse(request, bookings, now, contacts) };
  }

  /** (3) Nothing was claimed: find out why. Every lookup is scoped to the caller. */
  private async classifyUnclaimed(
    quoteId: string,
    clientId: string,
    now: Date,
  ): Promise<ConfirmBookingResult> {
    // A concurrent confirmation may have just committed the request.
    const winner = await this.replay(quoteId, clientId, now);
    if (winner) return winner;

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
      ...('request' in result
        ? {
            requestId: result.request.requestId,
            bookingIds: result.request.bookings.map((booking) => booking.bookingId),
          }
        : {}),
    });
    return result;
  }
}
