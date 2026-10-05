import type { CheckInNoticeField, IBookingRepository } from '../../src/application/features/goalkeeperRequests/common/ports.js';
import { Booking } from '../../src/domain/bookings/booking.js';

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

  async dismissRequestFor(requestId: string, goalkeeperId: string): Promise<void> {
    for (const booking of this.all().filter((item) => item.requestId === requestId)) {
      const dismissed = [...new Set([...booking.dismissedGoalkeeperIds, goalkeeperId])];
      this.seed(Booking.rehydrate({ ...booking, dismissedGoalkeeperIds: dismissed }));
    }
  }

  async findById(id: string): Promise<Booking | null> {
    return this.bookings.get(id) ?? null;
  }

  async findAvailableCandidates(query: {
    zoneIds: string[];
    excludeClientId: string;
    maxCommission: number;
    now: Date;
    cap: number;
  }): Promise<Booking[]> {
    return this.all()
      .filter(
        (booking) =>
          booking.status === 'pending_assignment' &&
          query.zoneIds.includes(booking.zoneId) &&
          booking.searchEndsAt > query.now &&
          booking.clientId !== query.excludeClientId &&
          booking.commission <= query.maxCommission,
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || compare(a.id, b.id))
      .slice(0, query.cap);
  }

  async findDueForExpiry(now: Date, cap: number): Promise<Booking[]> {
    return this.all()
      .filter((booking) => booking.status === 'pending_assignment' && !booking.isSearchOpenAt(now))
      .sort((a, b) => a.searchEndsAt.getTime() - b.searchEndsAt.getTime() || a.id.localeCompare(b.id))
      .slice(0, cap);
  }

  async findAssignedToGoalkeepers(goalkeeperIds: readonly string[]): Promise<Booking[]> {
    return this.all().filter((booking) => booking.goalkeeperId !== null && goalkeeperIds.includes(booking.goalkeeperId) && booking.status === 'assigned');
  }

  async findOpenPending(now: Date, cap: number): Promise<Booking[]> {
    return this.all()
      .filter((booking) => booking.status === 'pending_assignment' && booking.isSearchOpenAt(now))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id))
      .slice(0, cap);
  }

  async findForCheckInWatch(now: Date, cap: number): Promise<Booking[]> {
    const from = now.getTime() - 60 * 60_000;
    const to = now.getTime() + 120 * 60_000;
    return this.all()
      .filter((booking) => booking.status === 'assigned' && booking.startsAt.getTime() > from && booking.startsAt.getTime() <= to)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id))
      .slice(0, cap);
  }

  async findDueForCompletion(now: Date, cap: number): Promise<Booking[]> {
    return this.all()
      .filter((booking) => booking.status === 'assigned' && booking.endsAt.getTime() <= now.getTime())
      .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime() || a.id.localeCompare(b.id))
      .slice(0, cap);
  }

  async findRateable(userId: string, now: Date): Promise<{ asClient: Booking[]; asGoalkeeper: Booking[] }> {
    const since = now.getTime() - 7 * 86_400_000;
    const recent = this.all().filter((booking) => booking.endsAt.getTime() >= since);
    return {
      asClient: recent.filter(
        (booking) => booking.clientId === userId && (booking.status === 'completed' || (booking.status === 'assigned' && booking.checkIn !== null)),
      ),
      asGoalkeeper: recent.filter((booking) => booking.goalkeeperId === userId && booking.status === 'completed'),
    };
  }

  async findDueForAttendance(now: Date, cap: number): Promise<Booking[]> {
    return this.all()
      .filter((booking) => booking.status === 'completed' && booking.attendance === null && booking.endsAt.getTime() <= now.getTime() - 15 * 60_000)
      .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime() || a.id.localeCompare(b.id))
      .slice(0, cap);
  }

  async markCheckInNotice(bookingId: string, field: CheckInNoticeField, now: Date): Promise<boolean> {
    const booking = this.all().find((item) => item.id === bookingId);
    if (!booking || booking[field] !== null) return false;
    this.seed(Booking.rehydrate({ ...booking, [field]: now }));
    return true;
  }

  async findAssignedToGoalkeeper(goalkeeperId: string): Promise<Booking[]> {
    return this.all().filter((booking) => booking.goalkeeperId === goalkeeperId && booking.status === 'assigned');
  }

  async countForGoalkeeper(goalkeeperId: string, now: Date): Promise<{ upcoming: number; past: number }> {
    const own = this.all().filter((booking) => booking.goalkeeperId === goalkeeperId);
    const upcoming = own.filter((booking) => booking.startsAt >= now).length;
    return { upcoming, past: own.length - upcoming };
  }

  async findUpcomingForGoalkeeper(goalkeeperId: string, now: Date, skip: number, limit: number): Promise<Booking[]> {
    return this.all()
      .filter((booking) => booking.goalkeeperId === goalkeeperId && booking.startsAt >= now)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || compare(a.id, b.id))
      .slice(skip, skip + limit);
  }

  async findPastForGoalkeeper(goalkeeperId: string, now: Date, skip: number, limit: number): Promise<Booking[]> {
    return this.all()
      .filter((booking) => booking.goalkeeperId === goalkeeperId && booking.startsAt < now)
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime() || compare(b.id, a.id))
      .slice(skip, skip + limit);
  }
}

/** Binary string order, as MongoDB compares string `_id`s. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
