import type { IClock } from '../../../../common/clock.js';
import type { IUserRepository } from '../../../auth/common/ports.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { ICityRepository } from '../../../locations/common/ports.js';
import type { IZoneRepository } from '../../../zones/common/ports.js';
import type { Booking } from '../../../../../domain/bookings/booking.js';
import type { GoalkeeperRequest } from '../../../../../domain/bookings/goalkeeperRequest.js';
import { loadContacts } from '../../common/contacts.js';
import { assignedGoalkeeperIds, toRequestResponse, type ListedRequestResponse } from '../../common/requestResponse.js';
import { pageWindow } from '../../common/pageWindow.js';
import type { IBookingRepository, IGoalkeeperRequestRepository } from '../../common/ports.js';
import { ListClientRequestsQuery, type ListClientRequestsResult } from './listClientRequestsQuery.js';

/**
 * The caller's requests as one list — upcoming (soonest first) then past (most recent first) —
 * cut into pages (009 research §1). "Now" is read once so the counts and the reads agree on which
 * segment every request is in; the page's bookings come from one read; zone and city names are
 * the current ones, `null` when gone; the assigned goalkeepers' contacts come from one user read.
 */
export class ListClientRequestsQueryHandler implements IQueryHandler<
  ListClientRequestsQuery,
  ListClientRequestsResult
> {
  constructor(
    private readonly requestRepository: IGoalkeeperRequestRepository,
    private readonly bookingRepository: IBookingRepository,
    private readonly zoneRepository: IZoneRepository,
    private readonly cityRepository: ICityRepository,
    private readonly userRepository: IUserRepository,
    private readonly clock: IClock,
  ) {}

  async handle(query: ListClientRequestsQuery): Promise<ListClientRequestsResult> {
    const { clientId, page, pageSize } = query;
    const now = this.clock.now();

    const counts = await this.requestRepository.countForClient(clientId, now);
    const window = pageWindow((page - 1) * pageSize, pageSize, counts.upcoming, counts.past);

    const [upcoming, past] = await Promise.all([
      window.upcoming
        ? this.requestRepository.findUpcomingForClient(clientId, now, window.upcoming.skip, window.upcoming.limit)
        : [],
      window.past
        ? this.requestRepository.findPastForClient(clientId, now, window.past.skip, window.past.limit)
        : [],
    ]);
    const requests = [...upcoming, ...past];

    const totalItems = counts.upcoming + counts.past;
    return {
      items: await this.toItems(requests, now),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }

  private async toItems(requests: GoalkeeperRequest[], now: Date): Promise<ListedRequestResponse[]> {
    if (requests.length === 0) return [];

    const zoneIds = [...new Set(requests.map((request) => request.match.zoneId))];
    const cityIds = [...new Set(requests.map((request) => request.match.cityId))];
    const [bookings, zones, cities] = await Promise.all([
      this.bookingRepository.findByRequestIds(requests.map((request) => request.id)),
      this.zoneRepository.getManyByIds(zoneIds),
      this.cityRepository.getByIds(cityIds),
    ]);
    const bookingsByRequest = new Map<string, Booking[]>();
    for (const booking of bookings) {
      bookingsByRequest.set(booking.requestId, [...(bookingsByRequest.get(booking.requestId) ?? []), booking]);
    }
    const contacts = await loadContacts(this.userRepository, assignedGoalkeeperIds(bookings));
    const zoneNames = new Map(zones.map((zone) => [zone.id, zone.name]));
    const cityNames = new Map(cities.map((city) => [city.id, city.name]));

    return requests.map((request) => ({
      ...toRequestResponse(request, bookingsByRequest.get(request.id) ?? [], now, contacts),
      zoneName: zoneNames.get(request.match.zoneId) ?? null,
      cityName: cityNames.get(request.match.cityId) ?? null,
    }));
  }
}
