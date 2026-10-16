import { FakeMarketRepository, testMarket } from '../../../../fakes/fakeMarketRepository.js';
import { describe, expect, it } from 'vitest';
import { SaveAvailabilitySectionCommand } from '../../../../../src/application/features/goalkeepers/commands/saveAvailabilitySection/saveAvailabilitySectionCommand.js';
import { SaveAvailabilitySectionCommandHandler } from '../../../../../src/application/features/goalkeepers/commands/saveAvailabilitySection/saveAvailabilitySectionCommandHandler.js';
import { FakeGoalkeeperRegistrationRepository } from '../../../../fakes/fakeGoalkeeperRegistrationRepository.js';
import { FakeZoneRepository } from '../../../../fakes/fakeZoneRepository.js';
import { GoalkeeperRegistration } from '../../../../../src/domain/goalkeepers/goalkeeperRegistration.js';
import { Zone } from '../../../../../src/domain/zones/zone.js';

const polygon = { type: 'Polygon' as const, coordinates: [[[0, 0]]] };

function buildHandler() {
  const repository = new FakeGoalkeeperRegistrationRepository();
  const marketRepository = new FakeMarketRepository();
  const zoneRepository = new FakeZoneRepository();
  let idCounter = 0;
  const idGenerator = { newId: (): string => `reg-${++idCounter}` };

  marketRepository.seed(testMarket({ id: 'city-medellin', name: 'Medellín', countryId: 'country-co' }));
  marketRepository.seed(testMarket({ id: 'city-bogota', name: 'Bogotá', countryId: 'country-co' }));
  zoneRepository.seed(
    new Zone({ id: 'zone-bello', marketId: 'city-medellin', name: 'Bello', slug: 'medellin-co-bello', geometry: polygon, active: true, displayOrder: 1 }),
  );
  zoneRepository.seed(
    new Zone({
      id: 'zone-copacabana',
      marketId: 'city-medellin',
      name: 'Copacabana',
      slug: 'medellin-co-copacabana',
      geometry: polygon,
      active: true,
      displayOrder: 2,
    }),
  );
  zoneRepository.seed(
    new Zone({ id: 'zone-inactive', marketId: 'city-medellin', name: 'Inactive', slug: 'medellin-co-inactive', geometry: polygon, active: false, displayOrder: 3 }),
  );
  zoneRepository.seed(
    new Zone({ id: 'zone-chapinero', marketId: 'city-bogota', name: 'Chapinero', slug: 'bogota-co-chapinero', geometry: polygon, active: true, displayOrder: 1 }),
  );

  return {
    repository,
    marketRepository,
    zoneRepository,
    handler: new SaveAvailabilitySectionCommandHandler(repository, marketRepository, zoneRepository, idGenerator),
  };
}

describe('SaveAvailabilitySectionCommandHandler', () => {
  it('saves the chosen market and its zones, marking the section complete', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(new SaveAvailabilitySectionCommand('user-1', 'city-medellin', ['zone-bello', 'zone-copacabana']));

    expect(result.outcome).toBe('success');
    expect(result.registration?.sections.availability.complete).toBe(true);
    expect(result.registration?.marketId).toBe('city-medellin');
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

    expect(result.outcome).toBe('invalid_market');
  });

  it('rejects a market that is not enabled (spec 031, FR-021)', async () => {
    const { handler, marketRepository } = buildHandler();
    marketRepository.seed(testMarket({ id: 'city-draft', name: 'Rionegro', countryId: 'country-co', status: 'draft' }));
    marketRepository.seed(marketRepository.markets.get('city-bogota')!.disable('staff-1', new Date()));

    expect((await handler.handle(new SaveAvailabilitySectionCommand('user-1', 'city-draft', []))).outcome).toBe('invalid_market');
    expect((await handler.handle(new SaveAvailabilitySectionCommand('user-1', 'city-bogota', ['zone-chapinero']))).outcome).toBe('invalid_market');
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

  it('rejects a zone that belongs to another market', async () => {
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
