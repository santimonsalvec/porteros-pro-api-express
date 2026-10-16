import { FakeMarketRepository, testMarket } from '../../../../fakes/fakeMarketRepository.js';
import { describe, expect, it } from 'vitest';
import { UpdateGoalkeeperAvailabilityCommand } from '../../../../../src/application/features/goalkeepers/commands/updateGoalkeeperAvailability/updateGoalkeeperAvailabilityCommand.js';
import { UpdateGoalkeeperAvailabilityCommandHandler } from '../../../../../src/application/features/goalkeepers/commands/updateGoalkeeperAvailability/updateGoalkeeperAvailabilityCommandHandler.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeGoalkeeperRegistrationRepository } from '../../../../fakes/fakeGoalkeeperRegistrationRepository.js';
import { FakeZoneRepository } from '../../../../fakes/fakeZoneRepository.js';
import { GoalkeeperProfile } from '../../../../../src/domain/goalkeepers/goalkeeperProfile.js';
import { GoalkeeperRegistration } from '../../../../../src/domain/goalkeepers/goalkeeperRegistration.js';
import { Zone } from '../../../../../src/domain/zones/zone.js';

const polygon = { type: 'Polygon' as const, coordinates: [[[0, 0]]] };

function zone(id: string, marketId: string, active = true, displayOrder = 1): Zone {
  return new Zone({ id, marketId, name: id, slug: id, geometry: polygon, active, displayOrder });
}

function buildHandler() {
  const profileRepository = new FakeGoalkeeperProfileRepository();
  const registrationRepository = new FakeGoalkeeperRegistrationRepository();
  const marketRepository = new FakeMarketRepository();
  const zoneRepository = new FakeZoneRepository();

  marketRepository.seed(testMarket({ id: 'city-medellin', name: 'Medellín', countryId: 'country-co' }));
  marketRepository.seed(testMarket({ id: 'city-bogota', name: 'Bogotá', countryId: 'country-co' }));
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
      marketId: 'city-medellin',
      zoneIds: ['zone-bello'],
      activatedAt: new Date('2026-08-30'),
    }),
  );

  return {
    profileRepository,
    registrationRepository,
    marketRepository,
    handler: new UpdateGoalkeeperAvailabilityCommandHandler(profileRepository, registrationRepository, marketRepository, zoneRepository),
  };
}

describe('UpdateGoalkeeperAvailabilityCommandHandler', () => {
  it('replaces city and zones together and leaves the physical data alone', async () => {
    const { handler, profileRepository } = buildHandler();

    const result = await handler.handle(
      new UpdateGoalkeeperAvailabilityCommand('user-1', 'city-medellin', ['zone-bello', 'zone-copacabana']),
    );

    expect(result.outcome).toBe('success');
    expect(result.goalkeeper).toMatchObject({ status: 'active', marketId: 'city-medellin', serviceZoneIds: ['zone-bello', 'zone-copacabana'] });
    const stored = await profileRepository.getByUserId('user-1');
    expect(stored?.marketId).toBe('city-medellin');
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

  it('only changes zones of the current market: another market goes through the market change (spec 031)', async () => {
    const { handler, profileRepository } = buildHandler();

    const other = await handler.handle(new UpdateGoalkeeperAvailabilityCommand('user-1', 'city-bogota', ['zone-chapinero']));
    const unknown = await handler.handle(new UpdateGoalkeeperAvailabilityCommand('user-1', 'city-nowhere', ['zone-bello']));
    const withoutMarket = await handler.handle(new UpdateGoalkeeperAvailabilityCommand('user-1', null, ['zone-copacabana']));

    expect([other.outcome, unknown.outcome]).toEqual(['use_market_change', 'use_market_change']);
    expect(withoutMarket.outcome).toBe('success');
    expect(await profileRepository.getByUserId('user-1')).toMatchObject({ marketId: 'city-medellin', zoneIds: ['zone-copacabana'] });
  });

  it('still lets the goalkeeper change zones while their market is disabled', async () => {
    const { handler, marketRepository } = buildHandler();
    marketRepository.seed(marketRepository.markets.get('city-medellin')!.disable('staff-1', new Date()));

    expect((await handler.handle(new UpdateGoalkeeperAvailabilityCommand('user-1', null, ['zone-copacabana']))).outcome).toBe('success');
  });

  it('rejects zones that do not exist, are inactive, or belong to another city — naming each, writing nothing', async () => {
    const { handler, profileRepository } = buildHandler();

    const result = await handler.handle(
      new UpdateGoalkeeperAvailabilityCommand('user-1', 'city-medellin', ['zone-bello', 'zone-missing', 'zone-inactive', 'zone-chapinero']),
    );

    expect(result.outcome).toBe('invalid_zones');
    expect(result.invalidZoneIds).toEqual(['zone-missing', 'zone-inactive', 'zone-chapinero']);
    const stored = await profileRepository.getByUserId('user-1');
    expect([stored?.marketId, stored?.zoneIds]).toEqual(['city-medellin', ['zone-bello']]);
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
