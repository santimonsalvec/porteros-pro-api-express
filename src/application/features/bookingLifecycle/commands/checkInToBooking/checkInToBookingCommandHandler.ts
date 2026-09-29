import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { Booking } from '../../../../../domain/bookings/booking.js';
import { checkInWindow, distanceMeters } from '../../../../../domain/bookings/checkInWindow.js';
import { goalkeeperCheckedIn } from '../../../../../domain/events/bookingEvents.js';
import type { IIdGenerator, IUserRepository } from '../../../auth/common/ports.js';
import type { IEventRelay } from '../../../events/common/ports.js';
import type { IGoalkeeperProfileRepository } from '../../../goalkeepers/common/ports.js';
import { loadContacts } from '../../../goalkeeperRequests/common/contacts.js';
import { loadBookingItemContext, toAgendaItem } from '../../../goalkeeperRequests/common/goalkeeperBookingResponse.js';
import type { IBookingAuditLogger, IBookingRepository, IGoalkeeperRequestRepository } from '../../../goalkeeperRequests/common/ports.js';
import type { IImageRepository } from '../../../images/common/ports.js';
import type { ICityRepository } from '../../../locations/common/ports.js';
import type { IZoneRepository } from '../../../zones/common/ports.js';
import type { CheckInWindowResolver } from '../../common/checkInWindowResolver.js';
import type { IBookingLifecycleStore } from '../../common/ports.js';
import { CheckInToBookingCommand, type CheckInToBookingResult } from './checkInToBookingCommand.js';

export interface CheckInToBookingDependencies {
  goalkeeperProfileRepository: IGoalkeeperProfileRepository;
  imageRepository: IImageRepository;
  bookingRepository: IBookingRepository;
  requestRepository: IGoalkeeperRequestRepository;
  zoneRepository: IZoneRepository;
  cityRepository: ICityRepository;
  userRepository: IUserRepository;
  /** A fresh resolver per check-in (it caches per city). */
  windowResolver: () => CheckInWindowResolver;
  store: IBookingLifecycleStore;
  relay: IEventRelay;
  idGenerator: IIdGenerator;
  clock: IClock;
  audit: IBookingAuditLogger;
}

/**
 * The goalkeeper's proof of arrival (feature 020). The photo was uploaded beforehand (002) and
 * must be theirs; the location is evidence only and never blocks. The store records the check-in
 * and its event together, inside the window only (clarification 1); the event tells the client.
 */
export class CheckInToBookingCommandHandler implements ICommandHandler<CheckInToBookingCommand, CheckInToBookingResult> {
  constructor(private readonly deps: CheckInToBookingDependencies) {}

  async handle(command: CheckInToBookingCommand): Promise<CheckInToBookingResult> {
    const result = await this.checkIn(command);
    this.deps.audit.logCheckIn({
      outcome: result.outcome,
      goalkeeperId: command.goalkeeperId,
      bookingId: command.bookingId,
      ...('booking' in result ? { requestId: result.booking.requestId } : {}),
    });
    return result;
  }

  private async checkIn(command: CheckInToBookingCommand): Promise<CheckInToBookingResult> {
    const { goalkeeperId, bookingId } = command;
    if (!(await this.deps.goalkeeperProfileRepository.getByUserId(goalkeeperId))) return { outcome: 'not_a_goalkeeper' };
    const booking = await this.deps.bookingRepository.findById(bookingId);
    if (!booking || booking.goalkeeperId !== goalkeeperId) return { outcome: 'booking_not_found' };
    const image = await this.deps.imageRepository.getById(command.imageId);
    if (!image || image.uploadedBy !== goalkeeperId) return { outcome: 'invalid_photo' };
    const [request] = await this.deps.requestRepository.findByIds([booking.requestId]);
    if (!request) return { outcome: 'booking_not_found' };

    const now = this.deps.clock.now();
    const window = checkInWindow(request.startsAt, await this.deps.windowResolver()(request));
    const location = command.location
      ? { latitude: command.location.latitude, longitude: command.location.longitude, accuracyMeters: command.location.accuracyMeters ?? null }
      : null;
    const result = await this.deps.store.checkIn({
      bookingId,
      goalkeeperId,
      now,
      window,
      checkIn: {
        imageId: image.id,
        photoUrl: image.url,
        location,
        distanceMeters: location ? distanceMeters(location, request.match) : null,
      },
      buildEvents: (checkedIn) => [goalkeeperCheckedIn(this.deps.idGenerator.newId(), checkedIn, now)],
    });

    switch (result.kind) {
      case 'checked_in':
        await this.deps.relay.relay(result.events);
        return { outcome: 'checked_in', booking: await this.item(result.booking, now) };
      case 'replayed':
        return { outcome: 'replayed', booking: await this.item(result.booking, now) };
      case 'not_found':
        return { outcome: 'booking_not_found' };
      case 'not_assigned':
        return { outcome: 'not_assigned', status: result.status };
      case 'too_early':
        return { outcome: 'too_early', opensAt: result.opensAt.toISOString() };
      case 'too_late':
        return { outcome: 'too_late', closedAt: result.closedAt.toISOString() };
    }
  }

  private async item(booking: Booking, now: Date) {
    const [context, contacts] = await Promise.all([
      loadBookingItemContext(this.deps, [booking]),
      loadContacts(this.deps.userRepository, [booking.clientId]),
    ]);
    return toAgendaItem(booking, context, contacts.get(booking.clientId) ?? null, now);
  }
}
