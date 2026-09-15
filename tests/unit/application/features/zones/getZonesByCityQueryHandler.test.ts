import { describe, expect, it } from 'vitest';
import { GetZonesByCityQuery } from '../../../../../src/application/features/zones/queries/getZonesByCity/getZonesByCityQuery.js';
import { GetZonesByCityQueryHandler } from '../../../../../src/application/features/zones/queries/getZonesByCity/getZonesByCityQueryHandler.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { FakeZoneRepository } from '../../../../fakes/fakeZoneRepository.js';
import { City } from '../../../../../src/domain/locations/city.js';
import { Zone } from '../../../../../src/domain/zones/zone.js';

function buildHandler() {
  const cityRepository = new FakeCityRepository();
  const zoneRepository = new FakeZoneRepository();
  const handler = new GetZonesByCityQueryHandler(cityRepository, zoneRepository);
  return { cityRepository, zoneRepository, handler };
}

const polygon = { type: 'Polygon' as const, coordinates: [[[0, 0]]] };

describe('GetZonesByCityQueryHandler', () => {
  it('returns city_not_found for an unknown cityId', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(new GetZonesByCityQuery('does-not-exist'));

    expect(result.outcome).toBe('city_not_found');
  });

  it('returns only active zones sorted by displayOrder for an anchor city', async () => {
    const { handler, cityRepository, zoneRepository } = buildHandler();
    cityRepository.seed(new City({ id: 'city-medellin', name: 'Medellín', regionId: 'region-antioquia', zoneCityId: null }));
    zoneRepository.seed(
      new Zone({ id: 'zone-2', cityId: 'city-medellin', name: 'Bello', slug: 'medellin-co-bello', geometry: polygon, active: true, displayOrder: 2 }),
    );
    zoneRepository.seed(
      new Zone({ id: 'zone-1', cityId: 'city-medellin', name: 'Barbosa', slug: 'medellin-co-barbosa', geometry: polygon, active: true, displayOrder: 1 }),
    );
    zoneRepository.seed(
      new Zone({ id: 'zone-3', cityId: 'city-medellin', name: 'Inactive', slug: 'medellin-co-inactive', geometry: polygon, active: false, displayOrder: 3 }),
    );

    const result = await handler.handle(new GetZonesByCityQuery('city-medellin'));

    expect(result.outcome).toBe('success');
    expect(result.zones?.map((z) => z.id)).toEqual(['zone-1', 'zone-2']);
  });

  it('resolves a satellite city to its anchor\'s zones', async () => {
    const { handler, cityRepository, zoneRepository } = buildHandler();
    cityRepository.seed(new City({ id: 'city-medellin', name: 'Medellín', regionId: 'region-antioquia', zoneCityId: null }));
    cityRepository.seed(new City({ id: 'city-envigado', name: 'Envigado', regionId: 'region-antioquia', zoneCityId: 'city-medellin' }));
    zoneRepository.seed(
      new Zone({ id: 'zone-1', cityId: 'city-medellin', name: 'Bello', slug: 'medellin-co-bello', geometry: polygon, active: true, displayOrder: 1 }),
    );

    const result = await handler.handle(new GetZonesByCityQuery('city-envigado'));

    expect(result.outcome).toBe('success');
    expect(result.zones?.map((z) => z.id)).toEqual(['zone-1']);
  });

  it('returns no_zones_configured when the resolved anchor has zero active zones', async () => {
    const { handler, cityRepository } = buildHandler();
    cityRepository.seed(new City({ id: 'city-bogota', name: 'Bogotá', regionId: 'region-cundinamarca', zoneCityId: null }));

    const result = await handler.handle(new GetZonesByCityQuery('city-bogota'));

    expect(result.outcome).toBe('no_zones_configured');
  });

  it('returns no_zones_configured for a satellite city whose resolved anchor has zero active zones', async () => {
    const { handler, cityRepository } = buildHandler();
    cityRepository.seed(new City({ id: 'city-cali', name: 'Cali', regionId: 'region-cundinamarca', zoneCityId: null }));
    cityRepository.seed(new City({ id: 'city-palmira', name: 'Palmira', regionId: 'region-cundinamarca', zoneCityId: 'city-cali' }));

    const result = await handler.handle(new GetZonesByCityQuery('city-palmira'));

    expect(result.outcome).toBe('no_zones_configured');
  });
});
