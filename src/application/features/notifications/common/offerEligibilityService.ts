import type { Booking } from '../../../../domain/bookings/booking.js';
import { commissionOf, isEligible, type OfferSnapshot } from '../../../../domain/bookings/offerEligibility.js';
import type { GoalkeeperProfile } from '../../../../domain/goalkeepers/goalkeeperProfile.js';
import type { VettingTier } from '../../../../domain/goalkeepers/vetting.js';
import { offersStatus } from '../../../../domain/operatingBalance/fundsPolicy.js';
import { AVAILABLE_CANDIDATES_CAP } from '../../goalkeeperRequests/common/bookingLimits.js';
import type { IBookingRepository } from '../../goalkeeperRequests/common/ports.js';
import type { IGoalkeeperProfileRepository } from '../../goalkeepers/common/ports.js';
import type { ICommissionResolver, IVatRateResolver, IOperatingBalanceRepository } from '../../operatingBalance/common/ports.js';

export interface OfferEligibilityDependencies {
  goalkeeperProfileRepository: IGoalkeeperProfileRepository;
  operatingBalanceRepository: IOperatingBalanceRepository;
  commissionResolver: ICommissionResolver;
  bookingRepository: IBookingRepository;
  /** Matches must be affordable with their VAT (feature 023). */
  vatRates: IVatRateResolver;
}

/**
 * Why a goalkeeper sees no matches at all, checked in this order: pending validation (admin spec
 * 030) first, then clarification 3's order.
 */
export type UnavailableReason = 'pending_validation' | 'not_available_for_offers' | 'suspended' | 'insufficient_funds';

interface SnapshotWithFunds {
  snapshot: OfferSnapshot;
  /** How much the goalkeeper lacks to see offers (0 when nothing is missing). */
  missingAmount: number;
}

export type AvailableBookingsResult =
  | { kind: 'not_a_goalkeeper' }
  | { kind: 'unavailable'; reason: UnavailableReason; missingAmount: number | null; suspendedUntil: Date | null }
  | { kind: 'ok'; bookings: Booking[]; capReached: boolean; vatRateBps: number; tier: VettingTier; commissionOf: (booking: Booking) => number };

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
    if (profile.tier === 'unvalidated') {
      return { kind: 'unavailable', reason: 'pending_validation', missingAmount: null, suspendedUntil: null };
    }
    if (!profile.availableForOffers) {
      return { kind: 'unavailable', reason: 'not_available_for_offers', missingAmount: null, suspendedUntil: null };
    }
    if (profile.suspendedUntil && profile.suspendedUntil > now) {
      return { kind: 'unavailable', reason: 'suspended', missingAmount: null, suspendedUntil: profile.suspendedUntil };
    }

    const [{ snapshot, missingAmount }] = (await this.snapshotsFor([profile], now)) as [SnapshotWithFunds];
    if (!snapshot.canSeeOffers) {
      return { kind: 'unavailable', reason: 'insufficient_funds', missingAmount, suspendedUntil: null };
    }

    const candidates = await this.deps.bookingRepository.findAvailableCandidates({
      zoneIds: profile.zoneIds,
      excludeClientId: goalkeeperId,
      // With a rule of their own the stored commission says nothing about what they pay (feature 033).
      maxCommission: snapshot.ownRules.length > 0 ? null : snapshot.balance,
      now,
      cap: AVAILABLE_CANDIDATES_CAP,
    });
    return {
      kind: 'ok',
      bookings: candidates.filter((booking) => isEligible(snapshot, booking, now)),
      capReached: candidates.length === AVAILABLE_CANDIDATES_CAP,
      vatRateBps: snapshot.vatRateBps,
      tier: profile.tier,
      commissionOf: (booking) => commissionOf(snapshot, booking),
    };
  }

  /** Every goalkeeper who can take at least one of the bookings, with the ones they can take. */
  async eligibleGoalkeepersFor(bookings: readonly Booking[], now: Date): Promise<Map<string, Booking[]>> {
    const result = new Map<string, Booking[]>();
    if (bookings.length === 0) return result;
    const profiles = await this.deps.goalkeeperProfileRepository.findOfferCandidates([
      ...new Set(bookings.map((booking) => booking.zoneId)),
    ]);
    for (const { snapshot } of await this.snapshotsFor(profiles, now)) {
      const eligible = bookings.filter((booking) => isEligible(snapshot, booking, now));
      if (eligible.length > 0) result.set(snapshot.goalkeeperId, eligible);
    }
    return result;
  }

  /** Balance, `canSeeOffers` and held bookings of many goalkeepers in three batched reads. */
  private async snapshotsFor(profiles: readonly GoalkeeperProfile[], now: Date): Promise<SnapshotWithFunds[]> {
    if (profiles.length === 0) return [];
    const ids = profiles.map((profile) => profile.userId);
    const marketIds = [...new Set(profiles.map((profile) => profile.marketId))];
    const [operatingBalances, lowest, held, cityRates] = await Promise.all([
      this.deps.operatingBalanceRepository.findByGoalkeeperIds(ids),
      this.deps.commissionResolver.lowestForGoalkeepers(profiles.map((profile) => ({ goalkeeperId: profile.userId, zoneIds: profile.zoneIds })), now),
      this.deps.bookingRepository.findAssignedToGoalkeepers(ids),
      Promise.all(marketIds.map(async (marketId) => [marketId, await this.deps.vatRates.forMarket(marketId)] as const)),
    ]);
    const rates = new Map(cityRates);
    const balances = new Map(operatingBalances.map((operatingBalance) => [operatingBalance.goalkeeperId, operatingBalance.balance]));
    return profiles.map((profile) => {
      const balance = balances.get(profile.userId) ?? 0;
      const vatRateBps = rates.get(profile.marketId) ?? 0;
      const threshold = lowest.get(profile.userId);
      const funds = offersStatus(balance, profile.zoneIds.map((zoneId) => threshold?.lowest.get(zoneId) ?? null), vatRateBps);
      return {
        snapshot: {
          goalkeeperId: profile.userId,
          zoneIds: profile.zoneIds,
          availableForOffers: profile.availableForOffers,
          suspendedUntil: profile.suspendedUntil,
          balance,
          canSeeOffers: funds.canSeeOffers,
          vatRateBps,
          held: held.filter((booking) => booking.goalkeeperId === profile.userId),
          tier: profile.tier,
          ownRules: threshold?.ownRules ?? [],
        },
        missingAmount: funds.missingAmount,
      };
    });
  }
}
