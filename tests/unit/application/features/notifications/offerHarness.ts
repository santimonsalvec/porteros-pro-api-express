import { PushNotifier } from '../../../../../src/application/features/devices/common/pushNotifier.js';
import { OfferSender } from '../../../../../src/application/features/notifications/common/offerSender.js';
import { OfferEligibilityService } from '../../../../../src/application/features/notifications/common/offerEligibilityService.js';
import type { IWalletRepository } from '../../../../../src/application/features/wallet/common/ports.js';
import { Wallet } from '../../../../../src/domain/wallet/wallet.js';
import { FakeBookingRepository } from '../../../../fakes/fakeBookingRepository.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { buildGoalkeeperProfile } from '../../../../fixtures/walletFixtures.js';
import type { Booking } from '../../../../../src/domain/bookings/booking.js';
import type { GoalkeeperRequest } from '../../../../../src/domain/bookings/goalkeeperRequest.js';
import { City } from '../../../../../src/domain/locations/city.js';
import { Zone } from '../../../../../src/domain/zones/zone.js';
import { sha256TokenFingerprint } from '../../../../../src/infrastructure/push/tokenRef.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { FakeZoneRepository } from '../../../../fakes/fakeZoneRepository.js';
import { FakeDeviceRepository } from '../../../../fakes/fakeDeviceRepository.js';
import { FakeGoalkeeperRequestRepository } from '../../../../fakes/fakeGoalkeeperRequestRepository.js';
import { FakeNotificationRepository } from '../../../../fakes/fakeNotificationRepository.js';
import { FakeOfferPushState } from '../../../../fakes/fakeOfferPushState.js';
import { FakePushSender } from '../../../../fakes/fakePushSender.js';
import { buildRequest, buildRequestBookings } from '../../../../fixtures/quoteFixtures.js';
import { fixedVatRates } from '../../../../fakes/fakeVatRates.js';

/** 13:00 in Bogotá on a Sunday; matches start later that day or the next. */
export const OFFERS_NOW = '2026-10-04T18:00:00.000Z';

const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };

/** Everything offers need, over fakes, with a real `PushNotifier` so push results are real. */
export function offerHarness() {
  const clock = new FixedClock(OFFERS_NOW);
  const notifications = new FakeNotificationRepository();
  const pushState = new FakeOfferPushState();
  const devices = new FakeDeviceRepository();
  const pushSender = new FakePushSender();
  const pushNotifier = new PushNotifier({ devices, sender: pushSender, logger: silent, fingerprint: sha256TokenFingerprint });
  const requestRepository = new FakeGoalkeeperRequestRepository();
  const zoneRepository = new FakeZoneRepository();
  zoneRepository.seed(
    new Zone({
      id: 'zone-bello',
      cityId: 'city-medellin',
      name: 'Bello',
      slug: 'medellin-co-bello',
      geometry: { type: 'Polygon', coordinates: [[[0, 0]]] },
      active: true,
      displayOrder: 1,
    }),
  );
  const cityRepository = new FakeCityRepository();
  cityRepository.seed(new City({ id: 'city-medellin', name: 'Medellín', regionId: 'region-antioquia', zoneCityId: null }));
  let counter = 0;
  const sender = new OfferSender({
    notifications,
    pushState,
    pushNotifier,
    idGenerator: { newId: () => `0192a3b4-0000-7000-8000-${String(++counter).padStart(12, '0')}` },
    requestRepository,
    zoneRepository,
    cityRepository,
    logger: silent,
    maxReminders: 3,
    intervalMinutes: 5,
  });

  const bookingRepository = new FakeBookingRepository();
  const goalkeeperProfileRepository = new FakeGoalkeeperProfileRepository();
  const balances = new Map<string, number>();
  const wallet = (goalkeeperId: string) =>
    Wallet.rehydrate({ goalkeeperId, currency: 'COP', balance: balances.get(goalkeeperId)!, lastSequence: 1, createdAt: clock.now(), updatedAt: clock.now() });
  const walletRepository: IWalletRepository = {
    findByGoalkeeperId: async (id) => (balances.has(id) ? wallet(id) : null),
    findByGoalkeeperIds: async (ids) => ids.filter((id) => balances.has(id)).map(wallet),
  };
  const eligibility = new OfferEligibilityService({
    goalkeeperProfileRepository,
    walletRepository,
    commissionResolver: {
      resolveForZones: async (zoneIds: string[]) => new Map(zoneIds.map((zoneId) => [zoneId, 7000] as const)),
      resolveForMatch: async () => 7000,
    },
    bookingRepository,
    vatRates: fixedVatRates(0),
  });

  /** An active Bello goalkeeper with 20.000 COP (override anything). */
  const goalkeeper = (id: string, overrides: Parameters<typeof buildGoalkeeperProfile>[1] = {}, balance = 20000) => {
    goalkeeperProfileRepository.seed(buildGoalkeeperProfile(id, { zoneIds: ['zone-bello'], ...overrides }));
    balances.set(id, balance);
  };

  /** A Bello request starting `hoursAhead` hours after `OFFERS_NOW`, with its bookings stored in the request repo. */
  const match = (
    id: string,
    hoursAhead = 3,
    goalkeeperCount: 1 | 2 = 1,
    partialFulfillment: 'keep_confirmed' | 'cancel_all' = 'keep_confirmed',
  ): { request: GoalkeeperRequest; bookings: Booking[] } => {
    const request = buildRequest(id, new Date(new Date(OFFERS_NOW).getTime() + hoursAhead * 3_600_000), {
      zoneId: 'zone-bello',
      cityId: 'city-medellin',
      goalkeeperCount,
      partialFulfillment,
    });
    requestRepository.seed(request);
    const bookings = buildRequestBookings(request);
    bookings.forEach((booking) => bookingRepository.seed(booking));
    return { request, bookings };
  };

  /** Gives the goalkeeper a registered phone, so pushes are observable on `pushSender`. */
  const phone = (goalkeeperId: string) =>
    devices.upsert(`token-${goalkeeperId}`, goalkeeperId, 'android', clock.now());

  return {
    clock,
    notifications,
    pushState,
    devices,
    pushSender,
    pushNotifier,
    requestRepository,
    zoneRepository,
    cityRepository,
    bookingRepository,
    goalkeeperProfileRepository,
    eligibility,
    sender,
    match,
    phone,
    goalkeeper,
    silent,
  };
}
