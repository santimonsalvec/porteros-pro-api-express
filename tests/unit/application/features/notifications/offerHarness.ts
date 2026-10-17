import { FakeMarketRepository, testMarket } from '../../../../fakes/fakeMarketRepository.js';
import { PushNotifier } from '../../../../../src/application/features/devices/common/pushNotifier.js';
import { OfferSender } from '../../../../../src/application/features/notifications/common/offerSender.js';
import { OfferEligibilityService } from '../../../../../src/application/features/notifications/common/offerEligibilityService.js';
import type { IOperatingBalanceRepository } from '../../../../../src/application/features/operatingBalance/common/ports.js';
import { OperatingBalance } from '../../../../../src/domain/operatingBalance/operatingBalance.js';
import { FakeBookingRepository } from '../../../../fakes/fakeBookingRepository.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { buildGoalkeeperProfile } from '../../../../fixtures/operatingBalanceFixtures.js';
import type { Booking } from '../../../../../src/domain/bookings/booking.js';
import type { GoalkeeperRequest } from '../../../../../src/domain/bookings/goalkeeperRequest.js';
import { Zone } from '../../../../../src/domain/zones/zone.js';
import { sha256TokenFingerprint } from '../../../../../src/infrastructure/push/tokenRef.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeZoneRepository } from '../../../../fakes/fakeZoneRepository.js';
import { FakeDeviceRepository } from '../../../../fakes/fakeDeviceRepository.js';
import { FakeGoalkeeperRequestRepository } from '../../../../fakes/fakeGoalkeeperRequestRepository.js';
import { FakeNotificationRepository } from '../../../../fakes/fakeNotificationRepository.js';
import { FakeOfferPushState } from '../../../../fakes/fakeOfferPushState.js';
import { FakePushSender } from '../../../../fakes/fakePushSender.js';
import { buildRequest, buildRequestBookings } from '../../../../fixtures/quoteFixtures.js';
import { fixedVatRates } from '../../../../fakes/fakeVatRates.js';
import { FakeBookingSettingsRepository } from '../../../../fakes/fakeBookingSettingsRepository.js';
import { FakeUserLanguages } from '../../../../fakes/fakeUserLanguages.js';

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
      marketId: 'city-medellin',
      name: 'Bello',
      slug: 'medellin-co-bello',
      geometry: { type: 'Polygon', coordinates: [[[0, 0]]] },
      active: true,
      displayOrder: 1,
    }),
  );
  const marketRepository = new FakeMarketRepository();
  marketRepository.seed(testMarket({ id: 'city-medellin', name: 'Medellín', countryId: 'country-co' }));
  const bookingSettingsRepository = new FakeBookingSettingsRepository();
  /** The languages goalkeepers chose (feature 032): none by default. */
  const userLanguages = new FakeUserLanguages();
  let counter = 0;
  const sender = new OfferSender({
    notifications,
    pushState,
    pushNotifier,
    idGenerator: { newId: () => `0192a3b4-0000-7000-8000-${String(++counter).padStart(12, '0')}` },
    requestRepository,
    zoneRepository,
    marketRepository,
    bookingSettingsRepository,
    logger: silent,
    userLanguages,
    platformReminders: { maxReminders: 3, intervalMinutes: 5 },
  });

  const bookingRepository = new FakeBookingRepository();
  const goalkeeperProfileRepository = new FakeGoalkeeperProfileRepository();
  const balances = new Map<string, number>();
  const operatingBalance = (goalkeeperId: string) =>
    OperatingBalance.rehydrate({ goalkeeperId, currency: 'COP', balance: balances.get(goalkeeperId)!, lastSequence: 1, createdAt: clock.now(), updatedAt: clock.now() });
  const operatingBalanceRepository: IOperatingBalanceRepository = {
    findByGoalkeeperId: async (id) => (balances.has(id) ? operatingBalance(id) : null),
    findByGoalkeeperIds: async (ids) => ids.filter((id) => balances.has(id)).map(operatingBalance),
  };
  const eligibility = new OfferEligibilityService({
    goalkeeperProfileRepository,
    operatingBalanceRepository,
    commissionResolver: {
      lowestForGoalkeepers: async (goalkeepers: readonly { goalkeeperId: string; zoneIds: readonly string[] }[]) =>
        new Map(goalkeepers.map((goalkeeper) => [goalkeeper.goalkeeperId, { lowest: new Map(goalkeeper.zoneIds.map((zoneId) => [zoneId, 7000] as const)), ownRules: [] }])),
      resolveForMatch: async () => null,
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
      marketId: 'city-medellin',
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
    marketRepository,
    bookingSettingsRepository,
    userLanguages,
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
