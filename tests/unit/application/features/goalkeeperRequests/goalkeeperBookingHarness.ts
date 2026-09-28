import { CommissionResolver } from '../../../../../src/application/features/wallet/common/commissionResolver.js';
import { WalletLedger, type LedgerOwner } from '../../../../../src/application/features/wallet/common/walletLedger.js';
import type { Booking } from '../../../../../src/domain/bookings/booking.js';
import type { GoalkeeperRequest } from '../../../../../src/domain/bookings/goalkeeperRequest.js';
import { User } from '../../../../../src/domain/users/user.js';
import { CommissionSetting } from '../../../../../src/domain/wallet/commissionSetting.js';
import { Zone } from '../../../../../src/domain/zones/zone.js';
import { FakeBookingRepository } from '../../../../fakes/fakeBookingRepository.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeCommissionSettingRepository } from '../../../../fakes/fakeCommissionSettingRepository.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeGoalkeeperRequestRepository } from '../../../../fakes/fakeGoalkeeperRequestRepository.js';
import { FakeRegionRepository } from '../../../../fakes/fakeRegionRepository.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { FakeWalletStore } from '../../../../fakes/fakeWalletStore.js';
import { FakeZoneRepository } from '../../../../fakes/fakeZoneRepository.js';
import { buildRequest, buildRequestBookings } from '../../../../fixtures/quoteFixtures.js';
import { buildGoalkeeperProfile, COLOMBIA_INVOICING, seedWalletWorld } from '../../../../fixtures/walletFixtures.js';

/** "Now" for these tests: 13:00 in Bogotá on 2026-09-27. */
export const NOW = '2026-09-27T18:00:00.000Z';
const HOUR = 60 * 60 * 1000;
/** A start instant `hours` after NOW. */
export const inHours = (hours: number) => new Date(new Date(NOW).getTime() + hours * HOUR);

const zone = (id: string, name: string) =>
  new Zone({ id, cityId: 'city-cali', name, slug: id, geometry: { type: 'Polygon', coordinates: [] }, active: true, displayOrder: 1 });

/**
 * The Cali world for goalkeeper bookings: zones Norte and Sur (enabled for `gk-1`) and Centro
 * (not enabled), Colombia's commission 7.000 (Sur overrides it to 9.000), a client `client-a`.
 */
export class GoalkeeperBookingHarness {
  readonly profiles = new FakeGoalkeeperProfileRepository();
  readonly cities = new FakeCityRepository();
  readonly regions = new FakeRegionRepository();
  readonly countries = new FakeCountryRepository();
  readonly zones = new FakeZoneRepository();
  readonly settings = new FakeCommissionSettingRepository();
  readonly wallet = new FakeWalletStore();
  readonly bookings = new FakeBookingRepository();
  readonly requests = new FakeGoalkeeperRequestRepository();
  readonly users = new FakeUserRepository();
  readonly clock = new FixedClock(NOW);
  private counter = 0;
  readonly ledger = new WalletLedger(this.wallet, this.wallet, { newId: () => `m-${++this.counter}` }, this.clock);
  readonly commissionResolver = new CommissionResolver(this.settings, this.zones, this.cities, this.regions);

  constructor() {
    seedWalletWorld({ cityRepository: this.cities, regionRepository: this.regions, countryRepository: this.countries });
    this.zones.seed(zone('zone-cali-norte', 'Norte'));
    this.zones.seed(zone('zone-cali-sur', 'Sur'));
    this.zones.seed(zone('zone-cali-centro', 'Centro'));
    this.settings.seed(new CommissionSetting({ id: 'c-co', scope: 'country', refId: 'country-co', amount: 7000 }));
    this.settings.seed(new CommissionSetting({ id: 'c-sur', scope: 'zone', refId: 'zone-cali-sur', amount: 9000 }));
    this.profiles.seed(buildGoalkeeperProfile('gk-1', { zoneIds: ['zone-cali-norte', 'zone-cali-sur'] }));
    this.users.seed(this.user('client-a', 'Ana', 'Cliente', '300 111 2222'));
    this.users.seed(this.user('gk-1', 'Pepe', 'Portero', '300 333 4444'));
  }

  user(id: string, firstName: string, lastName: string, whatsAppNumber: string): User {
    const user = User.createFromExternalIdentity({ id, email: `${id}@example.com`, displayName: null, provider: 'google', subject: id });
    user.completeProfile(firstName, lastName, '+57', whatsAppNumber);
    return user;
  }

  owner(goalkeeperId = 'gk-1'): LedgerOwner {
    return { goalkeeperId, currency: 'COP', invoicing: COLOMBIA_INVOICING };
  }

  credit(amount: number, goalkeeperId = 'gk-1') {
    return this.ledger.adjust(this.owner(goalkeeperId), { adminUserId: 'admin-1', amount, reason: 'Saldo de pruebas', operationKey: `k-${++this.counter}` });
  }

  /** Stores a request with its bookings, as a confirmation would. */
  seedRequest(
    id: string,
    startsAt: Date,
    overrides: Parameters<typeof buildRequest>[2] = {},
    bookingIds?: string[],
  ): { request: GoalkeeperRequest; bookings: Booking[] } {
    const commission = overrides.commission ?? (overrides.zoneId === 'zone-cali-sur' ? 9000 : 7000);
    const request = buildRequest(id, startsAt, { ...overrides, commission });
    const bookings = buildRequestBookings(request, bookingIds);
    this.requests.seed(request);
    bookings.forEach((booking) => this.bookings.seed(booking));
    return { request, bookings };
  }

  /** Another active goalkeeper of Cali, with the given zones. */
  addGoalkeeper(userId: string, zoneIds = ['zone-cali-norte', 'zone-cali-sur']): void {
    this.profiles.seed(buildGoalkeeperProfile(userId, { zoneIds }));
    this.users.seed(this.user(userId, 'Otro', 'Portero', '300 555 6666'));
  }

  /** Marks a booking as assigned to the goalkeeper (as an acceptance would). */
  assign(booking: Booking, goalkeeperId = 'gk-1'): Booking {
    const assigned = booking.assign(goalkeeperId, this.clock.now());
    this.bookings.seed(assigned);
    return assigned;
  }
}
