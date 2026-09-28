import type { IClock } from '../../../../common/clock.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { firstConflict, holdsSameRequest } from '../../../../../domain/bookings/schedulePolicy.js';
import { offersStatus } from '../../../../../domain/wallet/fundsPolicy.js';
import type { IGoalkeeperProfileRepository } from '../../../goalkeepers/common/ports.js';
import type { ICityRepository } from '../../../locations/common/ports.js';
import type { ICommissionResolver, IWalletRepository } from '../../../wallet/common/ports.js';
import type { IZoneRepository } from '../../../zones/common/ports.js';
import { AVAILABLE_CANDIDATES_CAP } from '../../common/bookingLimits.js';
import { loadBookingItemContext, toAvailableItem } from '../../common/goalkeeperBookingResponse.js';
import type { IBookingRepository, IGoalkeeperRequestRepository } from '../../common/ports.js';
import { ListAvailableBookingsQuery, type ListAvailableBookingsResult } from './listAvailableBookingsQuery.js';

export interface ListAvailableBookingsDependencies {
  goalkeeperProfileRepository: IGoalkeeperProfileRepository;
  walletRepository: IWalletRepository;
  commissionResolver: ICommissionResolver;
  bookingRepository: IBookingRepository;
  requestRepository: IGoalkeeperRequestRepository;
  zoneRepository: IZoneRepository;
  cityRepository: ICityRepository;
  clock: IClock;
  /** Called when the candidate cap is reached (logged by infrastructure). */
  onCapReached?: (goalkeeperId: string) => void;
}

/**
 * Indexed candidates (pending, enabled zones, search open, not their own request, affordable),
 * then the clash and same-request rules in the domain, then pagination in memory so totals are
 * exact (research.md §4). A suspended goalkeeper, or one who cannot cover the lowest commission
 * of their zones, sees nothing — and is told why.
 */
export class ListAvailableBookingsQueryHandler implements IQueryHandler<ListAvailableBookingsQuery, ListAvailableBookingsResult> {
  constructor(private readonly deps: ListAvailableBookingsDependencies) {}

  async handle(query: ListAvailableBookingsQuery): Promise<ListAvailableBookingsResult> {
    const { goalkeeperId, page, pageSize } = query;
    const now = this.deps.clock.now();
    const empty = { outcome: 'success' as const, items: [], page, pageSize, totalItems: 0, totalPages: 0 };

    const profile = await this.deps.goalkeeperProfileRepository.getByUserId(goalkeeperId);
    if (!profile) return { outcome: 'not_a_goalkeeper' };
    if (profile.suspendedUntil && profile.suspendedUntil > now) {
      return { ...empty, unavailableReason: 'suspended', missingAmount: null, suspendedUntil: profile.suspendedUntil.toISOString() };
    }

    const [wallet, commissions] = await Promise.all([
      this.deps.walletRepository.findByGoalkeeperId(goalkeeperId),
      this.deps.commissionResolver.resolveForZones(profile.zoneIds),
    ]);
    const balance = wallet?.balance ?? 0;
    const offers = offersStatus(balance, [...commissions.values()]);
    if (!offers.canSeeOffers) {
      return { ...empty, unavailableReason: 'insufficient_funds', missingAmount: offers.missingAmount, suspendedUntil: null };
    }

    const [candidates, held] = await Promise.all([
      this.deps.bookingRepository.findAvailableCandidates({
        zoneIds: profile.zoneIds,
        excludeClientId: goalkeeperId,
        maxCommission: balance,
        now,
        cap: AVAILABLE_CANDIDATES_CAP,
      }),
      this.deps.bookingRepository.findAssignedToGoalkeeper(goalkeeperId),
    ]);
    if (candidates.length === AVAILABLE_CANDIDATES_CAP) this.deps.onCapReached?.(goalkeeperId);

    const takeable = candidates.filter((candidate) => !holdsSameRequest(candidate, held) && firstConflict(candidate, held) === null);
    const pageOf = takeable.slice((page - 1) * pageSize, page * pageSize);
    const context = await loadBookingItemContext(this.deps, pageOf);

    return {
      outcome: 'success',
      items: pageOf.map((booking) => toAvailableItem(booking, context)),
      page,
      pageSize,
      totalItems: takeable.length,
      totalPages: Math.ceil(takeable.length / pageSize),
      unavailableReason: null,
      missingAmount: null,
      suspendedUntil: null,
    };
  }
}
