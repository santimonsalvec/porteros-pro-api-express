import type { IBookingRepository } from '../../src/application/features/goalkeeperRequests/common/ports.js';
import type { Booking } from '../../src/domain/bookings/booking.js';

export class FakeBookingRepository implements IBookingRepository {
  private readonly bookings = new Map<string, Booking>();

  seed(booking: Booking): void {
    this.bookings.set(booking.id, booking);
  }

  all(): Booking[] {
    return [...this.bookings.values()];
  }

  async findByQuoteForClient(quoteId: string, clientId: string): Promise<Booking | null> {
    return (
      this.all().find((booking) => booking.quoteId === quoteId && booking.clientId === clientId) ??
      null
    );
  }

  async findByMatchForClient(
    clientId: string,
    zoneId: string,
    startsAt: Date,
  ): Promise<Booking | null> {
    return (
      this.all().find(
        (booking) =>
          booking.clientId === clientId &&
          booking.zoneId === zoneId &&
          booking.startsAt.getTime() === startsAt.getTime(),
      ) ?? null
    );
  }

  async countForClient(clientId: string, now: Date): Promise<{ upcoming: number; past: number }> {
    const own = this.all().filter((booking) => booking.clientId === clientId);
    const upcoming = own.filter((booking) => booking.startsAt >= now).length;
    return { upcoming, past: own.length - upcoming };
  }

  async findUpcomingForClient(clientId: string, now: Date, skip: number, limit: number): Promise<Booking[]> {
    return this.all()
      .filter((booking) => booking.clientId === clientId && booking.startsAt >= now)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || compareIds(a.id, b.id))
      .slice(skip, skip + limit);
  }

  async findPastForClient(clientId: string, now: Date, skip: number, limit: number): Promise<Booking[]> {
    return this.all()
      .filter((booking) => booking.clientId === clientId && booking.startsAt < now)
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime() || compareIds(b.id, a.id))
      .slice(skip, skip + limit);
  }
}

/** Binary string order, as MongoDB compares string `_id`s. */
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
