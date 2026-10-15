import type { IBookingRepository, IGoalkeeperRequestRepository } from '../../goalkeeperRequests/common/ports.js';
import type { ICaseRepository } from '../../cases/common/ports.js';
import type { IDepositRepository } from '../../payments/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import type { IClock } from '../../../common/clock.js';
import type { ClosureBlocker, IClosureBlockersReader } from './ports.js';

export interface ClosureBlockersDependencies {
  bookings: Pick<IBookingRepository, 'findAssignedToGoalkeeper'>;
  requests: Pick<IGoalkeeperRequestRepository, 'findByIds' | 'findUpcomingForClient'>;
  zones: Pick<IZoneRepository, 'getManyByIds'>;
  deposits: Pick<IDepositRepository, 'findPendingForGoalkeeper'>;
  cases: Pick<ICaseRepository, 'findOpenForParticipant'>;
  clock: IClock;
}

/** A client's upcoming requests are listed up to here; more than that already blocks. */
const CLIENT_REQUESTS_CAP = 50;

/**
 * What stands between a user and leaving (feature 029): matches accepted and not played yet, deposits
 * the gateway has not answered, and cases support has not resolved. For a client, the requests that
 * have not started (`bookingId` then holds the request id).
 */
export class ClosureBlockersReader implements IClosureBlockersReader {
  constructor(private readonly deps: ClosureBlockersDependencies) {}

  async forUser(userId: string, role: 'goalkeeper' | 'client'): Promise<ClosureBlocker[]> {
    const [matches, deposits, cases] = await Promise.all([
      role === 'goalkeeper' ? this.goalkeeperMatches(userId) : this.clientRequests(userId),
      role === 'goalkeeper' ? this.deps.deposits.findPendingForGoalkeeper(userId) : Promise.resolve([]),
      this.deps.cases.findOpenForParticipant(userId),
    ]);
    return [
      ...matches,
      ...deposits.map((deposit): ClosureBlocker => ({ code: 'pending_deposits', depositId: deposit.id, amount: deposit.amount, currency: deposit.currency })),
      ...cases.map((item): ClosureBlocker => ({ code: 'open_cases', caseId: item.id, type: item.type })),
    ];
  }

  private async goalkeeperMatches(goalkeeperId: string): Promise<ClosureBlocker[]> {
    const bookings = await this.deps.bookings.findAssignedToGoalkeeper(goalkeeperId);
    if (bookings.length === 0) return [];
    const requests = await this.deps.requests.findByIds([...new Set(bookings.map((booking) => booking.requestId))]);
    const requestById = new Map(requests.map((request) => [request.id, request]));
    const zones = await this.deps.zones.getManyByIds([...new Set(bookings.map((booking) => booking.zoneId))]);
    const zoneName = new Map(zones.map((zone) => [zone.id, zone.name]));
    return bookings
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .map((booking): ClosureBlocker => ({
        code: 'assigned_bookings',
        bookingId: booking.id,
        startsAtLocal: requestById.get(booking.requestId)?.match.startsAtLocal ?? booking.startsAt.toISOString(),
        placeName: zoneName.get(booking.zoneId) ?? null,
      }));
  }

  private async clientRequests(clientId: string): Promise<ClosureBlocker[]> {
    const requests = await this.deps.requests.findUpcomingForClient(clientId, this.deps.clock.now(), 0, CLIENT_REQUESTS_CAP);
    const zones = await this.deps.zones.getManyByIds([...new Set(requests.map((request) => request.match.zoneId))]);
    const zoneName = new Map(zones.map((zone) => [zone.id, zone.name]));
    return requests.map((request): ClosureBlocker => ({
      code: 'assigned_bookings',
      bookingId: request.id,
      startsAtLocal: request.match.startsAtLocal,
      placeName: zoneName.get(request.match.zoneId) ?? null,
    }));
  }
}
