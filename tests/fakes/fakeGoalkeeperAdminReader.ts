import type { GoalkeeperListFilter, GoalkeeperListRecord, IGoalkeeperAdminReader } from '../../src/application/features/goalkeepers/common/adminPorts.js';
import type { RatingSummary } from '../../src/application/features/goalkeepers/common/adminViews.js';
import type { ScheduledRecord } from '../../src/application/features/users/common/ports.js';
import type { FakeGoalkeeperProfileRepository } from './fakeGoalkeeperProfileRepository.js';
import type { FakeWalletStore } from './fakeWalletStore.js';
import type { FakeBookingLifecycleStore } from './fakeBookingLifecycleStore.js';
import type { FakeBookingRepository } from './fakeBookingRepository.js';

/** The admin's goalkeeper reads over the in-memory stores, filtering like the Mongo reader. */
export class FakeGoalkeeperAdminReader implements IGoalkeeperAdminReader {
  constructor(
    private readonly stores: {
      profiles: FakeGoalkeeperProfileRepository;
      wallets: FakeWalletStore;
      lifecycle: FakeBookingLifecycleStore;
      bookings: FakeBookingRepository;
    },
  ) {}

  async list(filter: GoalkeeperListFilter): Promise<{ items: GoalkeeperListRecord[]; totalItems: number }> {
    const wallets = new Map(this.stores.wallets.wallets().map((wallet) => [wallet.goalkeeperId, wallet]));
    const now = filter.now.getTime();
    const records = (await this.stores.profiles.getAll())
      .filter((profile) => filter.userIds === undefined || filter.userIds.includes(profile.userId))
      .filter((profile) => filter.cityId === undefined || profile.cityId === filter.cityId)
      .filter((profile) => filter.zoneId === undefined || profile.zoneIds.includes(filter.zoneId))
      .filter((profile) => filter.suspended === undefined || filter.suspended === (profile.suspendedUntil !== null && profile.suspendedUntil.getTime() > now))
      .filter((profile) => filter.availableForOffers === undefined || filter.availableForOffers === profile.availableForOffers)
      .map((profile): GoalkeeperListRecord => ({
        userId: profile.userId,
        cityId: profile.cityId,
        zoneCount: profile.zoneIds.length,
        availableForOffers: profile.availableForOffers,
        suspendedUntil: profile.suspendedUntil,
        balance: wallets.get(profile.userId)?.balance ?? 0,
        currency: wallets.get(profile.userId)?.currency ?? null,
        activatedAt: profile.activatedAt,
      }))
      .filter((record) => filter.balanceBelow === undefined || record.balance < filter.balanceBelow)
      .sort((a, b) => b.activatedAt.getTime() - a.activatedAt.getTime());
    const start = (filter.page - 1) * filter.pageSize;
    return { items: records.slice(start, start + filter.pageSize), totalItems: records.length };
  }

  async ratingsFor(userIds: readonly string[]): Promise<Map<string, RatingSummary>> {
    const result = new Map<string, RatingSummary>();
    for (const userId of userIds) {
      const stars = this.stores.lifecycle.ratings().filter((rating) => rating.subjectId === userId && rating.side === 'client').map((rating) => rating.stars);
      if (stars.length > 0) result.set(userId, { average: Math.round((stars.reduce((sum, value) => sum + value, 0) / stars.length) * 10) / 10, count: stars.length });
    }
    return result;
  }

  async incidentCounts(userId: string): Promise<{ withdrawal: number; no_show: number }> {
    const mine = this.stores.lifecycle.incidents().filter((incident) => incident.goalkeeperId === userId);
    return { withdrawal: mine.filter((incident) => incident.kind === 'withdrawal').length, no_show: mine.filter((incident) => incident.kind === 'no_show').length };
  }

  async upcomingBookings(userId: string, now: Date, limit: number): Promise<{ total: number; items: ScheduledRecord[] }> {
    const upcoming = this.stores.bookings
      .all()
      .filter((booking) => booking.goalkeeperId === userId && booking.status === 'assigned' && booking.startsAt > now)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    return {
      total: upcoming.length,
      items: upcoming.slice(0, limit).map((booking) => ({ id: booking.id, requestId: booking.requestId, startsAt: booking.startsAt, zoneId: booking.zoneId })),
    };
  }
}
