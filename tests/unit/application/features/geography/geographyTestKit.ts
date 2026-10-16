import { City } from '../../../../../src/domain/locations/city.js';
import { Country } from '../../../../../src/domain/countries/country.js';
import { Region } from '../../../../../src/domain/locations/region.js';
import { Zone } from '../../../../../src/domain/zones/zone.js';
import { fakeAdminGeography } from '../../../../fakes/fakeAdminGeography.js';
import { FakeFutureBookingsProbe, FakeReadinessSummary, FakeReferenceUsage } from '../../../../fakes/fakeReferenceUsage.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeMarketRepository, testMarket } from '../../../../fakes/fakeMarketRepository.js';

/** Colombia, Antioquia and its municipalities, and the market Medellín with one zone (spec 031), in memory. */
export function geographyKit() {
  const repositories = fakeAdminGeography();
  const usage = new FakeReferenceUsage();
  const futureBookings = new FakeFutureBookingsProbe();
  const readiness = new FakeReadinessSummary();
  const clock = new FixedClock('2026-10-08T12:00:00.000Z');
  let next = 0;
  const ids = { newId: () => `new-${++next}` };

  repositories.countries.items.set('co', new Country({ id: 'co', name: 'Colombia', dialCode: '+57', countryCode: 'CO', currency: 'COP' }));
  repositories.regions.items.set('ant', new Region({ id: 'ant', name: 'Antioquia', countryId: 'co' }));
  repositories.cities.items.set('med', new City({ id: 'med', name: 'Medellín', regionId: 'ant', daneStateCode: '05', daneCityCode: '05001', revision: 2 }));
  repositories.cities.items.set('env', new City({ id: 'env', name: 'Envigado', regionId: 'ant' }));
  repositories.cities.items.set('ita', new City({ id: 'ita', name: 'Itagüí', regionId: 'ant' }));
  const markets = new FakeMarketRepository();
  markets.seed(testMarket({ id: 'med', name: 'Medellín', countryId: 'co' }));
  repositories.zones.items.set(
    'z-laureles',
    new Zone({
      id: 'z-laureles',
      marketId: 'med',
      name: 'Laureles',
      slug: 'laureles',
      geometry: { type: 'Polygon', coordinates: [[[-75.6, 6.24], [-75.58, 6.24], [-75.58, 6.26], [-75.6, 6.26], [-75.6, 6.24]]] },
      active: true,
      displayOrder: 1,
    }),
  );

  return { ...repositories, markets, usage, futureBookings, readiness, clock, ids };
}
