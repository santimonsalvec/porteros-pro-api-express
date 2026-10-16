import { describe, expect, it } from 'vitest';
import { GetCitiesQuery } from '../../../../../src/application/features/locations/queries/getCities/getCitiesQuery.js';
import { GetCitiesQueryHandler } from '../../../../../src/application/features/locations/queries/getCities/getCitiesQueryHandler.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { FakeRegionRepository } from '../../../../fakes/fakeRegionRepository.js';
import { City } from '../../../../../src/domain/locations/city.js';
import { Region } from '../../../../../src/domain/locations/region.js';

function buildHandler() {
  const cityRepository = new FakeCityRepository();
  const regionRepository = new FakeRegionRepository();
  regionRepository.seed(new Region({ id: 'region-antioquia', name: 'Antioquia' }));
  regionRepository.seed(new Region({ id: 'region-cundinamarca', name: 'Cundinamarca' }));
  cityRepository.seed(new City({ id: 'medellin', name: 'Medellín', regionId: 'region-antioquia', daneStateCode: '05', daneCityCode: '05001' }));
  cityRepository.seed(new City({ id: 'bello', name: 'Bello', regionId: 'region-antioquia', daneStateCode: '05', daneCityCode: '05088' }));
  cityRepository.seed(new City({ id: 'bogota', name: 'Bogotá', regionId: 'region-cundinamarca', daneStateCode: '11', daneCityCode: '11001' }));
  cityRepository.seed(new City({ id: 'sin-dane', name: 'Belén sin código', regionId: 'region-antioquia' }));
  const handler = new GetCitiesQueryHandler(cityRepository, regionRepository);
  return { handler };
}

describe('GetCitiesQueryHandler (municipalities for billing, spec 031 §A3)', () => {
  it('returns nothing until something is typed', async () => {
    const { handler } = buildHandler();
    expect((await handler.handle(new GetCitiesQuery('  '))).cities).toEqual([]);
  });

  it('finds municipalities by name with their department', async () => {
    const { handler } = buildHandler();
    const result = await handler.handle(new GetCitiesQuery('be'));
    expect(result.cities).toEqual([{ id: 'bello', name: 'Bello', stateName: 'Antioquia' }]);
  });

  it('leaves out municipalities without official codes, which cannot be invoiced', async () => {
    const { handler } = buildHandler();
    const result = await handler.handle(new GetCitiesQuery('bel'));
    expect(result.cities.map((city) => city.id)).toEqual(['bello']);
  });

  it('answers an empty department name when the region is missing', async () => {
    const { handler } = buildHandler();
    const result = await handler.handle(new GetCitiesQuery('bogo'));
    expect(result.cities).toEqual([{ id: 'bogota', name: 'Bogotá', stateName: 'Cundinamarca' }]);
  });
});
