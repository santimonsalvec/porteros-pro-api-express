import type { Booking } from '../../../../domain/bookings/booking.js';
import { isEligible, type OfferSnapshot } from '../../../../domain/bookings/offerEligibility.js';
import type { GoalkeeperProfile } from '../../../../domain/goalkeepers/goalkeeperProfile.js';
import { offersStatus } from '../../../../domain/wallet/fundsPolicy.js';
import { AVAILABLE_CANDIDATES_CAP } from '../../goalkeeperRequests/common/bookingLimits.js';
import type { IBookingRepository } from '../../goalkeeperRequests/common/ports.js';
import type { IGoalkeeperProfileRepository } from '../../goalkeepers/common/ports.js';
import type { ICommissionResolver, IWalletRepository } from '../../wallet/common/ports.js';

export interface OfferEligibilityDependencies {
  goalkeeperProfileRepository: IGoalkeeperProfileRepository;
  walletRepository: IWalletRepository;
  commissionResolver: ICommissionResolver;
  bookingRepository: IBookingRepository;
}

/** Why a goalkeeper sees no matches at all, checked in this order (clarification 3 first). */
export type UnavailableReason = 'not_available_for_offers' | 'suspended' | 'insufficient_funds';

interface SnapshotWithFunds {
  snapshot: OfferSnapshot;
  /** How much the goalkeeper lacks to see offers (0 when nothing is missing). */
  missingAmount: number;
}

export type AvailableBookingsResult =
  | { kind: 'not_a_goalkeeper' }
  | { kind: 'unavailable'; reason: UnavailableReason; missingAmount: number | null; suspendedUntil: Date | null }
  | { kind: 'ok'; bookings: Booking[]; capReached: boolean };

/**
 * "Can this goalkeeper take this booking now", in both directions (research §1): per goalkeeper
 * for "available matches", the switch catch-up and the inbox, and per booking for offers and
 * reminders. Both end in the same domain predicate, so they can never disagree (FR-002).
 */
export class OfferEligibilityService {
  constructor(private readonly deps: OfferEligibilityDependencies) {}

  async availableBookingsFor(goalkeeperId: string, now: Date): Promise<AvailableBookingsResult> {
    const profile = await this.deps.goalkeeperProfileRepository.getByUserId(goalkeeperId);
    if (!profile) return { kind: 'not_a_goalkeeper' };
    if (!profile.availableForOffers) {
      return { kind: 'unavailable', reason: 'not_available_for_offers', missingAmount: null, suspendedUntil: null };
    }
    if (profile.suspendedUntil && profile.suspendedUntil > now) {
      return { kind: 'unavailable', reason: 'suspended', missingAmount: null, suspendedUntil: profile.suspendedUntil };
    }

    const [{ snapshot, missingAmount }] = (await this.snapshotsFor([profile])) as [SnapshotWithFunds];
    if (!snapshot.canSeeOffers) {
      return { kind: 'unavailable', reason: 'insufficient_funds', missingAmount, suspendedUntil: null };
    }

    const candidates = await this.deps.bookingRepository.findAvailableCandidates({
      zoneIds: profile.zoneIds,
      excludeClientId: goalkeeperId,
      maxCommission: snapshot.balance,
      now,
      cap: AVAILABLE_CANDIDATES_CAP,
    });
    return {
      kind: 'ok',
      bookings: candidates.filter((booking) => isEligible(snapshot, booking, now)),
      capReached: candidates.length === AVAILABLE_CANDIDATES_CAP,
    };
  }

  /** Every goalkeeper who can take at least one of the bookings, with the ones they can take. */
  async eligibleGoalkeepersFor(bookings: readonly Booking[], now: Date): Promise<Map<string, Booking[]>> {
    const result = new Map<string, Booking[]>();
    if (bookings.length === 0) return result;
    const profiles = await this.deps.goalkeeperProfileRepository.findOfferCandidates([
      ...new Set(bookings.map((booking) => booking.zoneId)),
    ]);
    for (const { snapshot } of await this.snapshotsFor(profiles)) {
      const eligible = bookings.filter((booking) => isEligible(snapshot, booking, now));
      if (eligible.length > 0) result.set(snapshot.goalkeeperId, eligible);
    }
    return result;
  }

  /** Balance, `canSeeOffers` and held bookings of many goalkeepers in three batched reads. */
  private async snapshotsFor(profiles: readonly GoalkeeperProfile[]): Promise<SnapshotWithFunds[]> {
    if (profiles.length === 0) return [];
    const ids = profiles.map((profile) => profile.userId);
    const [wallets, commissions, held] = await Promise.all([
      this.deps.walletRepository.findByGoalkeeperIds(ids),
      this.deps.commissionResolver.resolveForZones([...new Set(profiles.flatMap((profile) => profile.zoneIds))]),
      this.deps.bookingRepository.findAssignedToGoalkeepers(ids),
    ]);
    const balances = new Map(wallets.map((wallet) => [wallet.goalkeeperId, wallet.balance]));
    return profiles.map((profile) => {
      const balance = balances.get(profile.userId) ?? 0;
      const funds = offersStatus(balance, profile.zoneIds.map((zoneId) => commissions.get(zoneId) ?? null));
      return {
        snapshot: {
          goalkeeperId: profile.userId,
          zoneIds: profile.zoneIds,
          availableForOffers: profile.availableForOffers,
          suspendedUntil: profile.suspendedUntil,
          balance,
          canSeeOffers: funds.canSeeOffers,
          held: held.filter((booking) => booking.goalkeeperId === profile.userId),
        },
        missingAmount: funds.missingAmount,
      };
    });
  }
}
