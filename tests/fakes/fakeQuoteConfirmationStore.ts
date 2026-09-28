import type {
  ClaimResult,
  IQuoteConfirmationStore,
} from '../../src/application/features/goalkeeperRequests/common/ports.js';
import type { Booking } from '../../src/domain/bookings/booking.js';
import type { GoalkeeperRequest } from '../../src/domain/bookings/goalkeeperRequest.js';
import type { Quote } from '../../src/domain/bookings/quote.js';
import type { DomainEvent } from '../../src/domain/events/domainEvent.js';
import type { FakeBookingRepository } from './fakeBookingRepository.js';
import type { FakeGoalkeeperRequestRepository } from './fakeGoalkeeperRequestRepository.js';
import type { FakeOutboxStore } from './fakeOutboxStore.js';
import type { FakeQuoteRepository } from './fakeQuoteRepository.js';

/**
 * In-memory stand-in for the transactional store, applying the same rules over the fakes: claim
 * only the client's unexpired quote, enforce both unique rules BEFORE touching anything (a
 * violation leaves the quote in place, as an aborted transaction would), else delete the quote
 * and store the request with all its bookings — and their events, in the outbox when one is given.
 */
export class FakeQuoteConfirmationStore implements IQuoteConfirmationStore {
  calls = 0;
  private forced: ClaimResult | Error | null = null;

  constructor(
    private readonly quotes: FakeQuoteRepository,
    private readonly requests: FakeGoalkeeperRequestRepository,
    private readonly bookings: FakeBookingRepository,
    private readonly outbox?: FakeOutboxStore,
  ) {}

  /**
   * The next call returns this result (a concurrent winner) or throws this error (an interrupted
   * transaction) without touching the fakes.
   */
  failNextWith(result: ClaimResult | Error): void {
    this.forced = result;
  }

  async claimAndCreateRequest(
    quoteId: string,
    clientId: string,
    now: Date,
    build: (quote: Quote) => { request: GoalkeeperRequest; bookings: Booking[]; events: DomainEvent[] },
  ): Promise<ClaimResult> {
    this.calls += 1;
    if (this.forced) {
      const forced = this.forced;
      this.forced = null;
      if (forced instanceof Error) throw forced;
      return forced;
    }

    const quote = await this.quotes.findByIdForClient(quoteId, clientId);
    if (!quote || quote.isExpiredAt(now)) return { kind: 'not_claimed' };

    const created = build(quote);
    const { request } = created;
    if (this.requests.all().some((existing) => existing.quoteId === request.quoteId)) {
      return { kind: 'already_requested' };
    }
    if (await this.requests.findActiveByMatchForClient(request.clientId, request.zoneId, request.startsAt)) {
      return { kind: 'duplicate_request', zoneId: request.zoneId, startsAt: request.startsAt };
    }

    this.quotes.remove(quote.id);
    this.requests.seed(request);
    created.bookings.forEach((booking) => this.bookings.seed(booking));
    this.outbox?.append(created.events, now);
    return { kind: 'created', request, bookings: created.bookings, events: created.events };
  }
}
