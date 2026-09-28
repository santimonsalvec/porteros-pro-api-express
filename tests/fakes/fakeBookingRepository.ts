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

  async findByRequestIds(requestIds: string[]): Promise<Booking[]> {
    return this.all()
      .filter((booking) => requestIds.includes(booking.requestId))
      .sort((a, b) => compare(a.requestId, b.requestId) || compare(a.id, b.id));
  }
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
