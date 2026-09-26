import type {
  ClaimResult,
  IQuoteConfirmationStore,
} from '../../src/application/features/goalkeeperRequests/common/ports.js';
import type { Booking } from '../../src/domain/bookings/booking.js';
import type { Quote } from '../../src/domain/bookings/quote.js';
import type { FakeBookingRepository } from './fakeBookingRepository.js';
import type { FakeQuoteRepository } from './fakeQuoteRepository.js';

/**
 * In-memory stand-in for the transactional store, applying the same rules over the two fakes:
 * claim only the client's unexpired quote, enforce both unique rules BEFORE touching anything
 * (a violation leaves the quote in place, as an aborted transaction would), else delete + insert.
 */
export class FakeQuoteConfirmationStore implements IQuoteConfirmationStore {
  calls = 0;
  private forced: ClaimResult | null = null;

  constructor(
    private readonly quotes: FakeQuoteRepository,
    private readonly bookings: FakeBookingRepository,
  ) {}

  /** The next call returns this result without touching the fakes — to simulate a concurrent winner. */
  failNextWith(result: ClaimResult): void {
    this.forced = result;
  }

  async claimAndBook(
    quoteId: string,
    clientId: string,
    now: Date,
    newBooking: (quote: Quote) => Booking,
  ): Promise<ClaimResult> {
    this.calls += 1;
    if (this.forced) {
      const forced = this.forced;
      this.forced = null;
      return forced;
    }

    const quote = await this.quotes.findByIdForClient(quoteId, clientId);
    if (!quote || quote.isExpiredAt(now)) return { kind: 'not_claimed' };

    const booking = newBooking(quote);
    if (this.bookings.all().some((existing) => existing.quoteId === booking.quoteId))
      return { kind: 'already_booked' };
    if (
      await this.bookings.findByMatchForClient(booking.clientId, booking.zoneId, booking.startsAt)
    ) {
      return { kind: 'duplicate_booking', zoneId: booking.zoneId, startsAt: booking.startsAt };
    }

    this.quotes.remove(quote.id);
    this.bookings.seed(booking);
    return { kind: 'booked', booking };
  }
}
