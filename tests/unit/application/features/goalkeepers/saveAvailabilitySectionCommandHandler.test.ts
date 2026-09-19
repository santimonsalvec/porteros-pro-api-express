import { describe, expect, it } from 'vitest';
import { SaveAvailabilitySectionCommand } from '../../../../../src/application/features/goalkeepers/commands/saveAvailabilitySection/saveAvailabilitySectionCommand.js';
import { SaveAvailabilitySectionCommandHandler } from '../../../../../src/application/features/goalkeepers/commands/saveAvailabilitySection/saveAvailabilitySectionCommandHandler.js';
import { FakeGoalkeeperRegistrationRepository } from '../../../../fakes/fakeGoalkeeperRegistrationRepository.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { FakeZoneRepository } from '../../../../fakes/fakeZoneRepository.js';
import { GoalkeeperRegistration } from '../../../../../src/domain/goalkeepers/goalkeeperRegistration.js';
import { City } from '../../../../../src/domain/locations/city.js';
import { Zone } from '../../../../../src/domain/zones/zone.js';

const polygon = { type: 'Polygon' as const, coordinates: [[[0, 0]]] };

function buildHandler() {
  const repository = new FakeGoalkeeperRegistrationRepository();
  const cityRepository = new FakeCityRepository();
  const zoneRepository = new FakeZoneRepository();
  let idCounter = 0;
  const idGenerator = { newId: (): string => `reg-${++idCounter}` };

  cityRepository.seed(new City({ id: 'city-medellin', name: 'Medellín', regionId: 'region-antioquia', zoneCityId: null }));
  cityRepository.seed(new City({ id: 'city-envigado', name: 'Envigado', regionId: 'region-antioquia', zoneCityId: 'city-medellin' }));
  cityRepository.seed(new City({ id: 'city-bogota', name: 'Bogotá', regionId: 'region-cundinamarca', zoneCityId: null }));
  zoneRepository.seed(
    new Zone({ id: 'zone-bello', cityId: 'city-medellin', name: 'Bello', slug: 'medellin-co-bello', geometry: polygon, active: true, displayOrder: 1 }),
  );
  zoneRepository.seed(
    new Zone({
      id: 'zone-copacabana',
      cityId: 'city-medellin',
      name: 'Copacabana',
      slug: 'medellin-co-copacabana',
      geometry: polygon,
      active: true,
      displayOrder: 2,
    }),
  );
  zoneRepository.seed(
    new Zone({ id: 'zone-inactive', cityId: 'city-medellin', name: 'Inactive', slug: 'medellin-co-inactive', geometry: polygon, active: false, displayOrder: 3 }),
  );
  zoneRepository.seed(
    new Zone({ id: 'zone-chapinero', cityId: 'city-bogota', name: 'Chapinero', slug: 'bogota-co-chapinero', geometry: polygon, active: true, displayOrder: 1 }),
  );

  return {
    repository,
    cityRepository,
    zoneRepository,
    handler: new SaveAvailabilitySectionCommandHandler(repository, cityRepository, zoneRepository, idGenerator),
  };
}

describe('SaveAvailabilitySectionCommandHandler', () => {
  it('saves the chosen city (possibly a satellite) and its zones, marking the section complete', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(new SaveAvailabilitySectionCommand('user-1', 'city-envigado', ['zone-bello', 'zone-copacabana']));

    expect(result.outcome).toBe('success');
    expect(result.registration?.sections.availability.complete).toBe(true);
    expect(result.registration?.cityId).toBe('city-envigado');
    expect(result.registration?.serviceZoneIds).toEqual(['zone-bello', 'zone-copacabana']);
  });

  it('deduplicates repeated zone ids before validating and persisting', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(new SaveAvailabilitySectionCommand('user-1', 'city-medellin', ['zone-bello', 'zone-bello']));

    expect(result.outcome).toBe('success');
    expect(result.registration?.serviceZoneIds).toEqual(['zone-bello']);
  });

  it('rejects a nonexistent city', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(new SaveAvailabilitySectionCommand('user-1', 'city-does-not-exist', ['zone-bello']));

    expect(result.outcome).toBe('invalid_city');
  });

  it('rejects a nonexistent zone', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(new SaveAvailabilitySectionCommand('user-1', 'city-medellin', ['zone-does-not-exist']));

    expect(result.outcome).toBe('invalid_zones');
    expect(result.invalidZoneIds).toEqual(['zone-does-not-exist']);
  });

  it('rejects an inactive zone', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(new SaveAvailabilitySectionCommand('user-1', 'city-medellin', ['zone-inactive']));

    expect(result.outcome).toBe('invalid_zones');
    expect(result.invalidZoneIds).toEqual(['zone-inactive']);
  });

  it('rejects a zone that belongs to a different city\'s anchor', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(new SaveAvailabilitySectionCommand('user-1', 'city-medellin', ['zone-chapinero']));

    expect(result.outcome).toBe('invalid_zones');
    expect(result.invalidZoneIds).toEqual(['zone-chapinero']);
  });

  it('rejects any change once active', async () => {
    const { handler, repository } = buildHandler();
    const active = GoalkeeperRegistration.createEmpty('reg-active', 'user-2');
    active.activate();
    repository.seed(active);

    const result = await handler.handle(new SaveAvailabilitySectionCommand('user-2', 'city-medellin', ['zone-bello']));

    expect(result.outcome).toBe('already_active');
  });
});
