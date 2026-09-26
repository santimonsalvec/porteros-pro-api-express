import type { IClock } from '../../../../common/clock.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { ICityRepository } from '../../../locations/common/ports.js';
import type { IZoneRepository } from '../../../zones/common/ports.js';
import type { Booking } from '../../../../../domain/bookings/booking.js';
import { toBookingResponse, type ListedBookingResponse } from '../../common/bookingResponse.js';
import { pageWindow } from '../../common/pageWindow.js';
import type { IBookingRepository } from '../../common/ports.js';
import { ListClientBookingsQuery, type ListClientBookingsResult } from './listClientBookingsQuery.js';

/**
 * The caller's bookings as one list — upcoming (soonest first) then past (most recent first) —
 * cut into pages (research.md §1). "Now" is read once so the counts and the reads agree on which
 * segment every booking is in (§4); zone and city names are the current ones, `null` when gone (§5).
 */
export class ListClientBookingsQueryHandler implements IQueryHandler<
  ListClientBookingsQuery,
  ListClientBookingsResult
> {
  constructor(
    private readonly bookingRepository: IBookingRepository,
    private readonly zoneRepository: IZoneRepository,
    private readonly cityRepository: ICityRepository,
    private readonly clock: IClock,
  ) {}

  async handle(query: ListClientBookingsQuery): Promise<ListClientBookingsResult> {
    const { clientId, page, pageSize } = query;
    const now = this.clock.now();

    const counts = await this.bookingRepository.countForClient(clientId, now);
    const window = pageWindow((page - 1) * pageSize, pageSize, counts.upcoming, counts.past);

    const [upcoming, past] = await Promise.all([
      window.upcoming
        ? this.bookingRepository.findUpcomingForClient(clientId, now, window.upcoming.skip, window.upcoming.limit)
        : [],
      window.past
        ? this.bookingRepository.findPastForClient(clientId, now, window.past.skip, window.past.limit)
        : [],
    ]);
    const bookings = [...upcoming, ...past];

    const totalItems = counts.upcoming + counts.past;
    return {
      items: await this.withNames(bookings),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }

  private async withNames(bookings: Booking[]): Promise<ListedBookingResponse[]> {
    if (bookings.length === 0) return [];

    const zoneIds = [...new Set(bookings.map((booking) => booking.match.zoneId))];
    const cityIds = [...new Set(bookings.map((booking) => booking.match.cityId))];
    const [zones, cities] = await Promise.all([
      this.zoneRepository.getManyByIds(zoneIds),
      this.cityRepository.getByIds(cityIds),
    ]);
    const zoneNames = new Map(zones.map((zone) => [zone.id, zone.name]));
    const cityNames = new Map(cities.map((city) => [city.id, city.name]));

    return bookings.map((booking) => ({
      ...toBookingResponse(booking),
      zoneName: zoneNames.get(booking.match.zoneId) ?? null,
      cityName: cityNames.get(booking.match.cityId) ?? null,
    }));
  }
}
