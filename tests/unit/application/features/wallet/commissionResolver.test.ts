import { beforeEach, describe, expect, it } from 'vitest';
import { CommissionResolver } from '../../../../../src/application/features/wallet/common/commissionResolver.js';
import { City } from '../../../../../src/domain/locations/city.js';
import { Region } from '../../../../../src/domain/locations/region.js';
import { CommissionSetting } from '../../../../../src/domain/wallet/commissionSetting.js';
import { Zone } from '../../../../../src/domain/zones/zone.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { FakeCommissionSettingRepository } from '../../../../fakes/fakeCommissionSettingRepository.js';
import { FakeRegionRepository } from '../../../../fakes/fakeRegionRepository.js';
import { FakeZoneRepository } from '../../../../fakes/fakeZoneRepository.js';

const zone = (id: string, cityId: string) =>
  new Zone({ id, cityId, name: id, slug: id, geometry: { type: 'Polygon', coordinates: [] }, active: true, displayOrder: 1 });

let settings: FakeCommissionSettingRepository;
let resolver: CommissionResolver;

beforeEach(() => {
  settings = new FakeCommissionSettingRepository();
  const zones = new FakeZoneRepository();
  const cities = new FakeCityRepository();
  const regions = new FakeRegionRepository();
  regions.seed(new Region({ id: 'region-antioquia', name: 'Antioquia', countryId: 'country-co' }));
  regions.seed(new Region({ id: 'region-valle', name: 'Valle', countryId: 'country-co' }));
  regions.seed(new Region({ id: 'region-x', name: 'X', countryId: 'country-mx' }));
  cities.seed(new City({ id: 'city-medellin', name: 'Medellín', regionId: 'region-antioquia', zoneCityId: null }));
  cities.seed(new City({ id: 'city-cali', name: 'Cali', regionId: 'region-valle', zoneCityId: null }));
  cities.seed(new City({ id: 'city-cdmx', name: 'CDMX', regionId: 'region-x', zoneCityId: null }));
  zones.seed(zone('zone-laureles', 'city-medellin'));
  zones.seed(zone('zone-poblado', 'city-medellin'));
  zones.seed(zone('zone-cali-norte', 'city-cali'));
  zones.seed(zone('zone-cdmx', 'city-cdmx'));
  settings.seed(new CommissionSetting({ id: 'c-co', scope: 'country', refId: 'country-co', amount: 7000 }));
  settings.seed(new CommissionSetting({ id: 'c-med', scope: 'city', refId: 'city-medellin', amount: 8000 }));
  settings.seed(new CommissionSetting({ id: 'c-lau', scope: 'zone', refId: 'zone-laureles', amount: 9000 }));
  resolver = new CommissionResolver(settings, zones, cities, regions);
});

describe('CommissionResolver — US3: zone, then anchor city, then country', () => {
  it('uses the most specific configured level for each zone', async () => {
    const resolved = await resolver.resolveForZones(['zone-laureles', 'zone-poblado', 'zone-cali-norte']);

    expect(Object.fromEntries(resolved)).toEqual({ 'zone-laureles': 9000, 'zone-poblado': 8000, 'zone-cali-norte': 7000 });
  });

  it('answers null for a zone whose country, city and zone have no commission, and for an unknown zone', async () => {
    const resolved = await resolver.resolveForZones(['zone-cdmx', 'zone-missing']);

    expect(Object.fromEntries(resolved)).toEqual({ 'zone-cdmx': null, 'zone-missing': null });
  });

  it('resolves several zones with a single settings read', async () => {
    await resolver.resolveForZones(['zone-laureles', 'zone-poblado', 'zone-cali-norte', 'zone-cdmx']);

    expect(settings.calls).toBe(1);
  });

  it('reads nothing for no zones', async () => {
    expect((await resolver.resolveForZones([])).size).toBe(0);
    expect(settings.calls).toBe(0);
  });
});

describe('CommissionResolver — feature 024: modality and level tiers', () => {
  beforeEach(() => {
    settings.seed(new CommissionSetting({ id: 'c-med-f11', scope: 'city', refId: 'city-medellin', amount: 10000, modality: 'futbol_11' }));
    settings.seed(
      new CommissionSetting({ id: 'c-med-f11-c', scope: 'city', refId: 'city-medellin', amount: 12000, modality: 'futbol_11', level: 'competitive' }),
    );
    settings.seed(new CommissionSetting({ id: 'c-co-micro', scope: 'country', refId: 'country-co', amount: 5000, modality: 'micro_futsal' }));
  });

  it.each([
    ['Fútbol 11 competitive in a city zone', 'zone-poblado', { modality: 'futbol_11', level: 'competitive' }, 12000],
    ['Fútbol 11 recreational in a city zone', 'zone-poblado', { modality: 'futbol_11', level: 'recreational' }, 10000],
    ['Micro, which the city does not price, falls to the city general', 'zone-poblado', { modality: 'micro_futsal', level: 'recreational' }, 8000],
    ['any uses the general commission', 'zone-poblado', { modality: 'any', level: 'competitive' }, 8000],
    ['the zone general beats the city Fútbol 11 (geography first)', 'zone-laureles', { modality: 'futbol_11', level: 'competitive' }, 9000],
    ['Micro in Cali uses the country Micro commission', 'zone-cali-norte', { modality: 'micro_futsal', level: 'competitive' }, 5000],
  ] as const)('resolves %s', async (_label, zoneId, match, amount) => {
    expect(await resolver.resolveForMatch(zoneId, match)).toBe(amount);
  });

  it('answers null for a match in an unconfigured zone', async () => {
    expect(await resolver.resolveForMatch('zone-cdmx', { modality: 'futbol_11', level: 'competitive' })).toBeNull();
  });

  it('gives each zone the lowest commission any match there could carry', async () => {
    const resolved = await resolver.resolveForZones(['zone-laureles', 'zone-poblado', 'zone-cali-norte']);

    expect(Object.fromEntries(resolved)).toEqual({ 'zone-laureles': 9000, 'zone-poblado': 8000, 'zone-cali-norte': 5000 });
  });
});
