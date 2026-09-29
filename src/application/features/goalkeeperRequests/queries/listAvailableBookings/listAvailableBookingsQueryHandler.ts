import type { IClock } from '../../../../common/clock.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IGoalkeeperProfileRepository } from '../../../goalkeepers/common/ports.js';
import type { ICityRepository } from '../../../locations/common/ports.js';
import { OfferEligibilityService } from '../../../notifications/common/offerEligibilityService.js';
import type { ICommissionResolver, IVatRateResolver, IWalletRepository } from '../../../wallet/common/ports.js';
import { vatFor } from '../../../../../domain/wallet/vat.js';
import type { IZoneRepository } from '../../../zones/common/ports.js';
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
  vatRates: IVatRateResolver;
  clock: IClock;
  /** Called when the candidate cap is reached (logged by infrastructure). */
  onCapReached?: (goalkeeperId: string) => void;
}

/**
 * What the goalkeeper can take right now, soonest first, one page at a time. The rules live in
 * `OfferEligibilityService` (shared with offers, feature 015); pagination happens in memory so
 * totals are exact (research.md §4). A goalkeeper who turned offers off, is suspended or cannot
 * cover the lowest commission of their zones sees nothing — and is told why.
 */
export class ListAvailableBookingsQueryHandler implements IQueryHandler<ListAvailableBookingsQuery, ListAvailableBookingsResult> {
  private readonly eligibility: OfferEligibilityService;

  constructor(private readonly deps: ListAvailableBookingsDependencies) {
    this.eligibility = new OfferEligibilityService(deps);
  }

  async handle(query: ListAvailableBookingsQuery): Promise<ListAvailableBookingsResult> {
    const { goalkeeperId, page, pageSize } = query;
    const available = await this.eligibility.availableBookingsFor(goalkeeperId, this.deps.clock.now());
    switch (available.kind) {
      case 'not_a_goalkeeper':
        return { outcome: 'not_a_goalkeeper' };
      case 'unavailable':
        return {
          outcome: 'success',
          items: [],
          page,
          pageSize,
          totalItems: 0,
          totalPages: 0,
          unavailableReason: available.reason,
          missingAmount: available.reason === 'insufficient_funds' ? available.missingAmount : null,
          suspendedUntil: available.suspendedUntil?.toISOString() ?? null,
        };
      case 'ok': {
        if (available.capReached) this.deps.onCapReached?.(goalkeeperId);
        const pageOf = available.bookings.slice((page - 1) * pageSize, page * pageSize);
        const context = await loadBookingItemContext(this.deps, pageOf);
        return {
          outcome: 'success',
          items: pageOf.map((booking) => {
            const vat = vatFor(booking.commission, available.vatRateBps);
            return { ...toAvailableItem(booking, context), vat, totalCharge: booking.commission + vat };
          }),
          page,
          pageSize,
          totalItems: available.bookings.length,
          totalPages: Math.ceil(available.bookings.length / pageSize),
          unavailableReason: null,
          missingAmount: null,
          suspendedUntil: null,
        };
      }
    }
  }
}
