import { describe, expect, it } from 'vitest';
import { GetCitiesQuery } from '../../../../../src/application/features/locations/queries/getCities/getCitiesQuery.js';
import { GetCitiesQueryHandler } from '../../../../../src/application/features/locations/queries/getCities/getCitiesQueryHandler.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { FakeRegionRepository } from '../../../../fakes/fakeRegionRepository.js';
import { FakeZoneRepository } from '../../../../fakes/fakeZoneRepository.js';
import { City } from '../../../../../src/domain/locations/city.js';
import { Region } from '../../../../../src/domain/locations/region.js';
import { Zone } from '../../../../../src/domain/zones/zone.js';

function buildHandler() {
  const cityRepository = new FakeCityRepository();
  const regionRepository = new FakeRegionRepository();
  const zoneRepository = new FakeZoneRepository();
  regionRepository.seed(new Region({ id: 'region-antioquia', name: 'Antioquia' }));
  regionRepository.seed(new Region({ id: 'region-cundinamarca', name: 'Cundinamarca' }));
  const handler = new GetCitiesQueryHandler(cityRepository, regionRepository, zoneRepository);
  return { cityRepository, regionRepository, zoneRepository, handler };
}

const polygon = { type: 'Polygon' as const, coordinates: [[[0, 0]]] };

describe('GetCitiesQueryHandler', () => {
  it('returns an empty list without querying when q is empty', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(new GetCitiesQuery(''));

    expect(result.cities).toEqual([]);
  });

  it('returns matching cities with resolved region name and hasZones', async () => {
    const { handler, cityRepository, zoneRepository } = buildHandler();
    cityRepository.seed(new City({ id: 'city-medellin', name: 'Medellín', regionId: 'region-antioquia', zoneCityId: null }));
    cityRepository.seed(new City({ id: 'city-envigado', name: 'Envigado', regionId: 'region-antioquia', zoneCityId: 'city-medellin' }));
    cityRepository.seed(new City({ id: 'city-bogota', name: 'Bogotá', regionId: 'region-cundinamarca', zoneCityId: null }));
    zoneRepository.seed(
      new Zone({ id: 'zone-1', cityId: 'city-medellin', name: 'Bello', slug: 'medellin-co-bello', geometry: polygon, active: true, displayOrder: 1 }),
    );

    const result = await handler.handle(new GetCitiesQuery('e'));

    const byId = Object.fromEntries(result.cities.map((c) => [c.id, c]));
    expect(byId['city-medellin']).toEqual({ id: 'city-medellin', name: 'Medellín', region: 'Antioquia', hasZones: true });
    expect(byId['city-envigado']).toEqual({ id: 'city-envigado', name: 'Envigado', region: 'Antioquia', hasZones: true });
    expect(byId['city-bogota']).toBeUndefined();
  });

  it('marks a city with zero active zones of its own as hasZones: false', async () => {
    const { handler, cityRepository } = buildHandler();
    cityRepository.seed(new City({ id: 'city-bogota', name: 'Bogotá', regionId: 'region-cundinamarca', zoneCityId: null }));

    const result = await handler.handle(new GetCitiesQuery('bog'));

    expect(result.cities).toEqual([{ id: 'city-bogota', name: 'Bogotá', region: 'Cundinamarca', hasZones: false }]);
  });

  it('marks a satellite city hasZones: false when its resolved anchor has zero active zones', async () => {
    const { handler, cityRepository } = buildHandler();
    cityRepository.seed(new City({ id: 'city-cali', name: 'Cali', regionId: 'region-cundinamarca', zoneCityId: null }));
    cityRepository.seed(new City({ id: 'city-palmira', name: 'Palmira', regionId: 'region-cundinamarca', zoneCityId: 'city-cali' }));

    const result = await handler.handle(new GetCitiesQuery('palmira'));

    expect(result.cities).toEqual([{ id: 'city-palmira', name: 'Palmira', region: 'Cundinamarca', hasZones: false }]);
  });
});
