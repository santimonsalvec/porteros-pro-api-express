import { describe, expect, it } from 'vitest';
import { UpdateGoalkeeperAvailabilityCommand } from '../../../../../src/application/features/goalkeepers/commands/updateGoalkeeperAvailability/updateGoalkeeperAvailabilityCommand.js';
import { UpdateGoalkeeperAvailabilityCommandHandler } from '../../../../../src/application/features/goalkeepers/commands/updateGoalkeeperAvailability/updateGoalkeeperAvailabilityCommandHandler.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeGoalkeeperRegistrationRepository } from '../../../../fakes/fakeGoalkeeperRegistrationRepository.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { FakeZoneRepository } from '../../../../fakes/fakeZoneRepository.js';
import { GoalkeeperProfile } from '../../../../../src/domain/goalkeepers/goalkeeperProfile.js';
import { GoalkeeperRegistration } from '../../../../../src/domain/goalkeepers/goalkeeperRegistration.js';
import { City } from '../../../../../src/domain/locations/city.js';
import { Zone } from '../../../../../src/domain/zones/zone.js';

const polygon = { type: 'Polygon' as const, coordinates: [[[0, 0]]] };

function zone(id: string, cityId: string, active = true, displayOrder = 1): Zone {
  return new Zone({ id, cityId, name: id, slug: id, geometry: polygon, active, displayOrder });
}

function buildHandler() {
  const profileRepository = new FakeGoalkeeperProfileRepository();
  const registrationRepository = new FakeGoalkeeperRegistrationRepository();
  const cityRepository = new FakeCityRepository();
  const zoneRepository = new FakeZoneRepository();

  cityRepository.seed(new City({ id: 'city-medellin', name: 'Medellín', regionId: 'region-antioquia', zoneCityId: null }));
  cityRepository.seed(new City({ id: 'city-envigado', name: 'Envigado', regionId: 'region-antioquia', zoneCityId: 'city-medellin' }));
  cityRepository.seed(new City({ id: 'city-bogota', name: 'Bogotá', regionId: 'region-cundinamarca', zoneCityId: null }));
  zoneRepository.seed(zone('zone-bello', 'city-medellin', true, 1));
  zoneRepository.seed(zone('zone-copacabana', 'city-medellin', true, 2));
  zoneRepository.seed(zone('zone-inactive', 'city-medellin', false, 3));
  zoneRepository.seed(zone('zone-chapinero', 'city-bogota', true, 1));

  profileRepository.seed(
    new GoalkeeperProfile({
      id: 'gp-1',
      userId: 'user-1',
      documentType: 'cedula_ciudadania',
      documentNumber: '123',
      issueDate: new Date('2013-01-01'),
      birthDate: new Date('1995-01-01'),
      documentPhotoAId: 'img-a',
      documentPhotoBId: 'img-b',
      heightCm: 185,
      weightKg: 78,
      cityId: 'city-medellin',
      zoneIds: ['zone-bello'],
      activatedAt: new Date('2026-08-30'),
    }),
  );

  return {
    profileRepository,
    registrationRepository,
    handler: new UpdateGoalkeeperAvailabilityCommandHandler(profileRepository, registrationRepository, cityRepository, zoneRepository),
  };
}

describe('UpdateGoalkeeperAvailabilityCommandHandler', () => {
  it('replaces city and zones together and leaves the physical data alone', async () => {
    const { handler, profileRepository } = buildHandler();

    const result = await handler.handle(
      new UpdateGoalkeeperAvailabilityCommand('user-1', 'city-envigado', ['zone-bello', 'zone-copacabana']),
    );

    expect(result.outcome).toBe('success');
    expect(result.goalkeeper).toMatchObject({ status: 'active', cityId: 'city-envigado', serviceZoneIds: ['zone-bello', 'zone-copacabana'] });
    const stored = await profileRepository.getByUserId('user-1');
    expect(stored?.cityId).toBe('city-envigado');
    expect(stored?.zoneIds).toEqual(['zone-bello', 'zone-copacabana']);
    expect([stored?.heightCm, stored?.weightKg]).toEqual([185, 78]);
  });

  it('de-duplicates repeated zone ids and is idempotent', async () => {
    const { handler, profileRepository } = buildHandler();
    const command = () => new UpdateGoalkeeperAvailabilityCommand('user-1', 'city-medellin', ['zone-bello', 'zone-bello']);

    await handler.handle(command());
    const repeated = await handler.handle(command());

    expect(repeated.outcome).toBe('success');
    expect((await profileRepository.getByUserId('user-1'))?.zoneIds).toEqual(['zone-bello']);
  });

  it('rejects an unknown city and writes nothing', async () => {
    const { handler, profileRepository } = buildHandler();

    const result = await handler.handle(new UpdateGoalkeeperAvailabilityCommand('user-1', 'city-nowhere', ['zone-bello']));

    expect(result.outcome).toBe('invalid_city');
    expect((await profileRepository.getByUserId('user-1'))?.cityId).toBe('city-medellin');
  });

  it('rejects zones that do not exist, are inactive, or belong to another city — naming each, writing nothing', async () => {
    const { handler, profileRepository } = buildHandler();

    const result = await handler.handle(
      new UpdateGoalkeeperAvailabilityCommand('user-1', 'city-medellin', ['zone-bello', 'zone-missing', 'zone-inactive', 'zone-chapinero']),
    );

    expect(result.outcome).toBe('invalid_zones');
    expect(result.invalidZoneIds).toEqual(['zone-missing', 'zone-inactive', 'zone-chapinero']);
    const stored = await profileRepository.getByUserId('user-1');
    expect([stored?.cityId, stored?.zoneIds]).toEqual(['city-medellin', ['zone-bello']]);
  });

  it('resolves zones through the anchor city, like the draft registration does', async () => {
    const { handler } = buildHandler();

    // city-envigado is not an anchor: its zones belong to city-medellin.
    const ok = await handler.handle(new UpdateGoalkeeperAvailabilityCommand('user-1', 'city-envigado', ['zone-bello']));
    const wrong = await handler.handle(new UpdateGoalkeeperAvailabilityCommand('user-1', 'city-envigado', ['zone-chapinero']));

    expect(ok.outcome).toBe('success');
    expect(wrong.outcome).toBe('invalid_zones');
  });

  it('reports not_a_goalkeeper when the user has neither a profile nor a registration', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(new UpdateGoalkeeperAvailabilityCommand('someone-else', 'city-medellin', ['zone-bello']));

    expect(result.outcome).toBe('not_a_goalkeeper');
  });

  it('reports not_active for a draft registration, before even looking at the city or zones', async () => {
    const { handler, registrationRepository, profileRepository } = buildHandler();
    registrationRepository.seed(GoalkeeperRegistration.createEmpty('reg-2', 'user-2'));

    const result = await handler.handle(new UpdateGoalkeeperAvailabilityCommand('user-2', 'city-nowhere', ['zone-missing']));

    expect(result.outcome).toBe('not_active');
    expect(await profileRepository.getByUserId('user-2')).toBeNull();
  });
});
