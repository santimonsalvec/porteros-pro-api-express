import type { IClock } from '../../../../common/clock.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { Booking } from '../../../../../domain/bookings/booking.js';
import { ratingWindowFor, type RatingSide } from '../../../../../domain/ratings/rating.js';
import type { IUserRepository } from '../../../auth/common/ports.js';
import { loadContacts } from '../../../goalkeeperRequests/common/contacts.js';
import { loadBookingItemContext } from '../../../goalkeeperRequests/common/goalkeeperBookingResponse.js';
import type { IBookingRepository, IGoalkeeperRequestRepository } from '../../../goalkeeperRequests/common/ports.js';
import type { ICityRepository } from '../../../locations/common/ports.js';
import type { IZoneRepository } from '../../../zones/common/ports.js';
import type { IRatingRepository } from '../../common/ports.js';
import { ListPendingRatingsQuery, type ListPendingRatingsResult, type PendingRatingItem } from './listPendingRatingsQuery.js';

export interface ListPendingRatingsDependencies {
  bookingRepository: IBookingRepository;
  ratingRepository: IRatingRepository;
  requestRepository: IGoalkeeperRequestRepository;
  zoneRepository: IZoneRepository;
  cityRepository: ICityRepository;
  userRepository: IUserRepository;
  clock: IClock;
}

export class ListPendingRatingsQueryHandler implements IQueryHandler<ListPendingRatingsQuery, ListPendingRatingsResult> {
  constructor(private readonly deps: ListPendingRatingsDependencies) {}

  async handle(query: ListPendingRatingsQuery): Promise<ListPendingRatingsResult> {
    const now = this.deps.clock.now();
    const { asClient, asGoalkeeper } = await this.deps.bookingRepository.findRateable(query.userId, now);
    const pending = [...(await this.unrated(asClient, 'client')), ...(await this.unrated(asGoalkeeper, 'goalkeeper'))]
      .map(({ booking, side }) => ({ booking, side, window: ratingWindowFor(booking, side, now) }))
      .filter((item) => item.window.ok);
    if (pending.length === 0) return { outcome: 'ok', items: [] };

    const bookings = pending.map((item) => item.booking);
    const [context, contacts] = await Promise.all([
      loadBookingItemContext(this.deps, bookings),
      loadContacts(this.deps.userRepository, pending.map(({ booking, side }) => (side === 'client' ? booking.goalkeeperId! : booking.clientId))),
    ]);
    const items = pending.map(({ booking, side, window }): PendingRatingItem => {
      const match = context.requests.get(booking.requestId)!.match;
      const other = contacts.get(side === 'client' ? booking.goalkeeperId! : booking.clientId);
      return {
        bookingId: booking.id,
        requestId: booking.requestId,
        side,
        question: side === 'client' ? 'goalkeeper_arrived' : 'payment_received',
        zoneName: context.zoneNames.get(match.zoneId) ?? null,
        cityName: context.cityNames.get(match.cityId) ?? null,
        startsAt: booking.startsAt.toISOString(),
        startsAtLocal: match.startsAtLocal,
        // Only the name: the WhatsApp was for the match (019), and ratings are private.
        otherParty: other ? { firstName: other.firstName, lastName: other.lastName } : null,
        dueUntil: window.ok ? window.dueUntil.toISOString() : '',
      };
    });
    items.sort((a, b) => b.startsAt.localeCompare(a.startsAt) || a.bookingId.localeCompare(b.bookingId));
    return { outcome: 'ok', items };
  }

  private async unrated(bookings: readonly Booking[], side: RatingSide): Promise<Array<{ booking: Booking; side: RatingSide }>> {
    const rated = new Set((await this.deps.ratingRepository.findByBookingsAndSide(bookings.map((b) => b.id), side)).map((r) => r.bookingId));
    return bookings.filter((booking) => !rated.has(booking.id)).map((booking) => ({ booking, side }));
  }
}
