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
}
