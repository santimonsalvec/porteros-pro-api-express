import type {
  BookingMoneyRecord,
  CheckInPhotoRecord,
  IRequestAdminReader,
  RequestDetailRecord,
  RequestListFilter,
  RequestListRecord,
} from '../../src/application/features/goalkeeperRequests/common/adminPorts.js';
import { countsOf, requestStatusFromCounts } from '../../src/domain/bookings/requestStatus.js';
import { OFFER_TYPE } from '../../src/domain/notifications/offerMessages.js';
import type { FakeBookingLifecycleStore } from './fakeBookingLifecycleStore.js';
import type { FakeBookingRepository } from './fakeBookingRepository.js';
import type { FakeMarketRepository } from './fakeMarketRepository.js';
import type { FakeGoalkeeperRequestRepository } from './fakeGoalkeeperRequestRepository.js';
import type { FakeNotificationRepository } from './fakeNotificationRepository.js';
import type { FakeOperatingBalanceStore } from './fakeOperatingBalanceStore.js';

/** The admin's request reads over the in-memory stores, filtering like the Mongo reader (admin spec 006). */
export class FakeRequestAdminReader implements IRequestAdminReader {
  constructor(
    private readonly stores: {
      markets: FakeMarketRepository;
      requests: FakeGoalkeeperRequestRepository;
      bookings: FakeBookingRepository;
      operatingBalance: FakeOperatingBalanceStore;
      lifecycle: FakeBookingLifecycleStore;
      notifications: FakeNotificationRepository;
    },
  ) {}

  async marketIdsOfCountry(countryId: string): Promise<string[]> {
    return [...this.stores.markets.markets.values()].filter((market) => market.countryId === countryId).map((market) => market.id);
  }

  async requestIdsOfGoalkeeper(goalkeeperId: string, limit: number): Promise<string[]> {
    const ids = new Set(this.stores.bookings.all().filter((booking) => booking.goalkeeperId === goalkeeperId).map((booking) => booking.requestId));
    return [...ids].slice(0, limit);
  }

  async requestIdsInMarkets(requestIds: readonly string[], marketIds: readonly string[]): Promise<string[]> {
    return this.stores.requests
      .all()
      .filter((request) => requestIds.includes(request.id) && marketIds.includes(request.match.marketId))
      .map((request) => request.id);
  }

  async list(filter: RequestListFilter): Promise<{ items: RequestListRecord[]; totalItems: number }> {
    const records = this.stores.requests
      .all()
      .filter((request) => !filter.from || request.startsAt.getTime() >= filter.from.getTime())
      .filter((request) => !filter.to || request.startsAt.getTime() < filter.to.getTime())
      .filter((request) => filter.zoneId === undefined || request.zoneId === filter.zoneId)
      .filter((request) => filter.marketIds === undefined || filter.marketIds.includes(request.match.marketId))
      .filter((request) => filter.clientId === undefined || request.clientId === filter.clientId)
      .filter((request) => filter.requestIds === undefined || filter.requestIds.includes(request.id))
      .map((request): RequestListRecord => ({
        requestId: request.id,
        clientId: request.clientId,
        startsAt: request.startsAt,
        timeZone: request.match.timeZone,
        marketId: request.match.marketId,
        zoneId: request.zoneId,
        goalkeeperCount: request.match.goalkeeperCount,
        counts: countsOf(this.stores.bookings.all().filter((booking) => booking.requestId === request.id)),
        total: request.pricing.total,
        currency: request.pricing.currency,
        createdAt: request.createdAt,
      }))
      .filter((record) => filter.status === undefined || requestStatusFromCounts(record.counts) === filter.status)
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime() || (a.requestId < b.requestId ? 1 : -1));
    const start = (filter.page - 1) * filter.pageSize;
    return { items: records.slice(start, start + filter.pageSize), totalItems: records.length };
  }

  async detail(requestId: string): Promise<RequestDetailRecord | null> {
    const request = this.stores.requests.all().find((item) => item.id === requestId);
    if (!request) return null;
    const bookings = this.stores.bookings
      .all()
      .filter((booking) => booking.requestId === requestId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1));
    const ids = new Set(bookings.map((booking) => booking.id));
    const money = new Map<string, BookingMoneyRecord>();
    for (const movement of this.stores.operatingBalance.movements()) {
      const [key, bookingId] = movement.causeKey.split(/:(.*)/s) as [string, string];
      if (!ids.has(bookingId) || !['commission', 'commission_vat', 'commission_refund', 'commission_vat_refund'].includes(key)) continue;
      const record = money.get(bookingId) ?? { charged: 0, chargedVat: 0, refunded: 0, refundedVat: 0, currency: movement.currency };
      const amount = Math.abs(movement.amount);
      if (key === 'commission') record.charged += amount;
      else if (key === 'commission_vat') record.chargedVat += amount;
      else if (key === 'commission_refund') record.refunded += amount;
      else record.refundedVat += amount;
      money.set(bookingId, record);
    }
    return {
      request,
      bookings,
      money,
      incidents: this.stores.lifecycle.incidents().filter((incident) => ids.has(incident.bookingId)),
      ratings: this.stores.lifecycle.ratings().filter((rating) => ids.has(rating.bookingId)),
      cases: this.stores.lifecycle.cases.all().filter((item) => ids.has(item.bookingId)),
      offersSent: this.stores.notifications.all().filter((item) => item.type === OFFER_TYPE && item.requestId === requestId).length,
    };
  }

  async checkInPhoto(bookingId: string, requestId?: string): Promise<CheckInPhotoRecord> {
    const booking = this.stores.bookings.all().find((item) => item.id === bookingId);
    if (!booking || (requestId !== undefined && booking.requestId !== requestId)) return { outcome: 'booking_not_found' };
    if (!booking.checkIn) return { outcome: 'check_in_not_found' };
    return { outcome: 'ok', photoUrl: booking.checkIn.photoUrl, at: booking.checkIn.at };
  }
}
