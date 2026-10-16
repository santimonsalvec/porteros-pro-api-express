import { describe, expect, it } from 'vitest';
import { City } from '../../../../../src/domain/locations/city.js';
import { Region } from '../../../../../src/domain/locations/region.js';
import { ListCitiesQuery } from '../../../../../src/application/features/geography/queries/listCities/listCitiesQuery.js';
import { ListCitiesQueryHandler } from '../../../../../src/application/features/geography/queries/listCities/listCitiesQueryHandler.js';
import { GetCityQuery } from '../../../../../src/application/features/geography/queries/getCity/getCityQuery.js';
import { GetCityQueryHandler } from '../../../../../src/application/features/geography/queries/getCity/getCityQueryHandler.js';
import { geographyKit } from './geographyTestKit.js';

function setup() {
  const kit = geographyKit();
  return {
    kit,
    list: (filters: ListCitiesQuery['filters'] = {}, page = 1, pageSize = 20) =>
      new ListCitiesQueryHandler(kit).handle(new ListCitiesQuery(filters, page, pageSize)),
    get: (cityId: string) => new GetCityQueryHandler(kit).handle(new GetCityQuery(cityId)),
  };
}

describe('ListCitiesQueryHandler (billing municipalities, spec 031)', () => {
  it('shows each municipality with its region, country and official codes', async () => {
    const { list } = setup();

    const page = await list();

    expect(page).toMatchObject({ page: 1, pageSize: 20, totalItems: 3, totalPages: 1 });
    expect(page.items.map((city) => city.name)).toEqual(['Envigado', 'Itagüí', 'Medellín']);
    expect(page.items[2]).toEqual({
      id: 'med',
      name: 'Medellín',
      region: { id: 'ant', name: 'Antioquia' },
      country: { id: 'co', name: 'Colombia', countryCode: 'CO' },
      daneStateCode: '05',
      daneCityCode: '05001',
      revision: 2,
    });
  });

  it('filters by name', async () => {
    const { list } = setup();
    expect((await list({ q: 'env' })).items.map((c) => c.id)).toEqual(['env']);
  });

  it('filters by country through its regions, and by region', async () => {
    const { kit, list } = setup();
    kit.regions.items.set('pic', new Region({ id: 'pic', name: 'Pichincha', countryId: 'ec' }));
    kit.cities.items.set('uio', new City({ id: 'uio', name: 'Quito', regionId: 'pic' }));

    expect((await list({ countryId: 'ec' })).items.map((c) => c.id)).toEqual(['uio']);
    expect((await list({ regionId: 'ant' })).totalItems).toBe(3);
    expect((await list({ countryId: 'pe' })).items).toEqual([]);
  });

  it('shows a region without country', async () => {
    const { kit, list } = setup();
    kit.regions.items.set('x', new Region({ id: 'x', name: 'Sin país' }));
    kit.cities.items.set('odd', new City({ id: 'odd', name: 'Odd', regionId: 'x' }));

    expect((await list({ q: 'odd' })).items[0]).toMatchObject({ country: null });
  });
});

describe('GetCityQueryHandler', () => {
  it('returns the municipality as the list shows it, or not found', async () => {
    const { get } = setup();
    expect(await get('env')).toMatchObject({ outcome: 'ok', city: { id: 'env', region: { id: 'ant', name: 'Antioquia' } } });
    expect(await get('nope')).toEqual({ outcome: 'not_found' });
  });
});
