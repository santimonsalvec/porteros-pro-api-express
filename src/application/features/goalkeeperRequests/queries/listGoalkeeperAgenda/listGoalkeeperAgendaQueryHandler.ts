import type { IClock } from '../../../../common/clock.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IUserRepository } from '../../../auth/common/ports.js';
import type { IGoalkeeperProfileRepository } from '../../../goalkeepers/common/ports.js';
import type { ICityRepository } from '../../../locations/common/ports.js';
import type { IZoneRepository } from '../../../zones/common/ports.js';
import { loadContacts } from '../../common/contacts.js';
import { loadBookingItemContext, toAgendaItem } from '../../common/goalkeeperBookingResponse.js';
import { pageWindow } from '../../common/pageWindow.js';
import type { IBookingRepository, IGoalkeeperRequestRepository } from '../../common/ports.js';
import { ListGoalkeeperAgendaQuery, type ListGoalkeeperAgendaResult } from './listGoalkeeperAgendaQuery.js';

export interface ListGoalkeeperAgendaDependencies {
  goalkeeperProfileRepository: IGoalkeeperProfileRepository;
  bookingRepository: IBookingRepository;
  requestRepository: IGoalkeeperRequestRepository;
  zoneRepository: IZoneRepository;
  cityRepository: ICityRepository;
  userRepository: IUserRepository;
  clock: IClock;
}

/**
 * The goalkeeper's bookings cut into pages the same way as the client's list (009 research §1):
 * "now" is read once so the counts and the reads agree on each booking's segment. Only bookings
 * held by the caller are ever read. A suspended goalkeeper still sees their agenda.
 */
export class ListGoalkeeperAgendaQueryHandler implements IQueryHandler<ListGoalkeeperAgendaQuery, ListGoalkeeperAgendaResult> {
  constructor(private readonly deps: ListGoalkeeperAgendaDependencies) {}

  async handle(query: ListGoalkeeperAgendaQuery): Promise<ListGoalkeeperAgendaResult> {
    const { goalkeeperId, page, pageSize } = query;
    const now = this.deps.clock.now();

    const profile = await this.deps.goalkeeperProfileRepository.getByUserId(goalkeeperId);
    if (!profile) return { outcome: 'not_a_goalkeeper' };

    const counts = await this.deps.bookingRepository.countForGoalkeeper(goalkeeperId, now);
    const window = pageWindow((page - 1) * pageSize, pageSize, counts.upcoming, counts.past);
    const [upcoming, past] = await Promise.all([
      window.upcoming
        ? this.deps.bookingRepository.findUpcomingForGoalkeeper(goalkeeperId, now, window.upcoming.skip, window.upcoming.limit)
        : [],
      window.past
        ? this.deps.bookingRepository.findPastForGoalkeeper(goalkeeperId, now, window.past.skip, window.past.limit)
        : [],
    ]);
    const bookings = [...upcoming, ...past];

    const context = await loadBookingItemContext(this.deps, bookings);
    const clientIds = bookings.map((booking) => booking.clientId);
    const contacts = await loadContacts(this.deps.userRepository, clientIds);

    const totalItems = counts.upcoming + counts.past;
    return {
      outcome: 'success',
      items: bookings.map((booking) => toAgendaItem(booking, context, contacts.get(booking.clientId) ?? null)),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }
}
