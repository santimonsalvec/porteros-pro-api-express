import { City } from '../../../../../src/domain/locations/city.js';
import { Country } from '../../../../../src/domain/countries/country.js';
import { Region } from '../../../../../src/domain/locations/region.js';
import { Zone } from '../../../../../src/domain/zones/zone.js';
import { fakeAdminGeography } from '../../../../fakes/fakeAdminGeography.js';
import { FakeFutureBookingsProbe, FakeReadinessSummary, FakeReferenceUsage } from '../../../../fakes/fakeReferenceUsage.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';

/** Colombia, Antioquia, Medellín (anchor with one zone) and Envigado (its satellite), in memory. */
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
  repositories.cities.items.set(
    'med',
    new City({ id: 'med', name: 'Medellín', regionId: 'ant', zoneCityId: null, timeZone: 'America/Bogota', daneStateCode: '05', daneCityCode: '05001', revision: 2 }),
  );
  repositories.cities.items.set('env', new City({ id: 'env', name: 'Envigado', regionId: 'ant', zoneCityId: 'med', timeZone: 'America/Bogota' }));
  repositories.cities.items.set('ita', new City({ id: 'ita', name: 'Itagüí', regionId: 'ant', zoneCityId: null }));
  repositories.zones.items.set(
    'z-laureles',
    new Zone({
      id: 'z-laureles',
      cityId: 'med',
      name: 'Laureles',
      slug: 'laureles',
      geometry: { type: 'Polygon', coordinates: [[[-75.6, 6.24], [-75.58, 6.24], [-75.58, 6.26], [-75.6, 6.26], [-75.6, 6.24]]] },
      active: true,
      displayOrder: 1,
    }),
  );

  return { ...repositories, usage, futureBookings, readiness, clock, ids };
}
