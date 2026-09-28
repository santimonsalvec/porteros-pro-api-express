import { CommissionResolver } from '../../../../../src/application/features/wallet/common/commissionResolver.js';
import { WalletLedger, type LedgerOwner } from '../../../../../src/application/features/wallet/common/walletLedger.js';
import { CommissionSetting } from '../../../../../src/domain/wallet/commissionSetting.js';
import { Zone } from '../../../../../src/domain/zones/zone.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeCommissionSettingRepository } from '../../../../fakes/fakeCommissionSettingRepository.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeRegionRepository } from '../../../../fakes/fakeRegionRepository.js';
import { FakeWalletStore } from '../../../../fakes/fakeWalletStore.js';
import { FakeZoneRepository } from '../../../../fakes/fakeZoneRepository.js';
import { COLOMBIA_INVOICING, seedWalletWorld, WALLET_NOW } from '../../../../fixtures/walletFixtures.js';

const zone = (id: string) =>
  new Zone({ id, cityId: 'city-cali', name: id, slug: id, geometry: { type: 'Polygon', coordinates: [] }, active: true, displayOrder: 1 });

/**
 * The Cali wallet world: Colombia's commission is 7.000 and zone `zone-cali-sur` overrides it to
 * 9.000. A zone id that is not seeded resolves to no commission at all.
 */
export class WalletHarness {
  readonly profiles = new FakeGoalkeeperProfileRepository();
  readonly cities = new FakeCityRepository();
  readonly regions = new FakeRegionRepository();
  readonly countries = new FakeCountryRepository();
  readonly zones = new FakeZoneRepository();
  readonly settings = new FakeCommissionSettingRepository();
  readonly store = new FakeWalletStore();
  readonly clock = new FixedClock(WALLET_NOW);
  private counter = 0;
  readonly ledger = new WalletLedger(this.store, this.store, { newId: () => `m-${++this.counter}` }, this.clock);
  readonly resolver = new CommissionResolver(this.settings, this.zones, this.cities, this.regions);
  readonly context = {
    goalkeeperProfileRepository: this.profiles,
    cityRepository: this.cities,
    regionRepository: this.regions,
    countryLookup: this.countries,
  };

  constructor() {
    seedWalletWorld({ cityRepository: this.cities, regionRepository: this.regions, countryRepository: this.countries });
    this.zones.seed(zone('zone-cali-norte'));
    this.zones.seed(zone('zone-cali-sur'));
    this.settings.seed(new CommissionSetting({ id: 'c-co', scope: 'country', refId: 'country-co', amount: 7000 }));
    this.settings.seed(new CommissionSetting({ id: 'c-sur', scope: 'zone', refId: 'zone-cali-sur', amount: 9000 }));
  }

  owner(goalkeeperId: string): LedgerOwner {
    return { goalkeeperId, currency: 'COP', invoicing: COLOMBIA_INVOICING };
  }

  credit(goalkeeperId: string, amount: number, key = `k-${++this.counter}`) {
    return this.ledger.adjust(this.owner(goalkeeperId), { adminUserId: 'admin-1', amount, reason: 'Saldo de pruebas', operationKey: key });
  }
}
