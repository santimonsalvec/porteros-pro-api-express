import { FakeMarketRepository, testMarket } from '../../../../fakes/fakeMarketRepository.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { CommissionResolver } from '../../../../../src/application/features/operatingBalance/common/commissionResolver.js';
import { CommissionSetting } from '../../../../../src/domain/operatingBalance/commissionSetting.js';
import { RentalRate } from '../../../../../src/domain/pricing/rentalRate.js';
import { Zone } from '../../../../../src/domain/zones/zone.js';
import { FakeCommissionSettingRepository } from '../../../../fakes/fakeCommissionSettingRepository.js';
import { FakeRentalRateRepository } from '../../../../fakes/fakeRentalRateRepository.js';
import { FakeZoneRepository } from '../../../../fakes/fakeZoneRepository.js';

const zone = (id: string, marketId: string) =>
  new Zone({ id, marketId, name: id, slug: id, geometry: { type: 'Polygon', coordinates: [] }, active: true, displayOrder: 1 });
const rule = (id: string, scope: string, refId: string, fixedAmount: number, percentBps = 0, extra: Partial<ConstructorParameters<typeof CommissionSetting>[0]> = {}) =>
  new CommissionSetting({ id, scope, refId, fixedAmount, percentBps, ...extra });
const rate = (id: string, scope: 'zone' | 'market', refId: string, amount: number, durationMinutes = 60, modality: string | null = null) =>
  new RentalRate({ id, scope, refId, durationMinutes, amount, modality });

const now = new Date('2026-10-17T12:00:00Z');
const viewer = { goalkeeperId: 'user-1', now };
let settings: FakeCommissionSettingRepository;
let rates: FakeRentalRateRepository;
let resolver: CommissionResolver;

beforeEach(() => {
  settings = new FakeCommissionSettingRepository();
  rates = new FakeRentalRateRepository();
  const zones = new FakeZoneRepository();
  const markets = new FakeMarketRepository();
  markets.seed(testMarket({ id: 'city-medellin', name: 'Medellín', countryId: 'country-co' }));
  markets.seed(testMarket({ id: 'city-cali', name: 'Cali', countryId: 'country-co' }));
  markets.seed(testMarket({ id: 'city-cdmx', name: 'CDMX', countryId: 'country-mx' }));
  zones.seed(zone('zone-laureles', 'city-medellin'));
  zones.seed(zone('zone-poblado', 'city-medellin'));
  zones.seed(zone('zone-cali-norte', 'city-cali'));
  zones.seed(zone('zone-cdmx', 'city-cdmx'));
  settings.seed(rule('c-co', 'country', 'country-co', 7000));
  settings.seed(rule('c-med', 'market', 'city-medellin', 8000));
  settings.seed(rule('c-lau', 'zone', 'zone-laureles', 9000));
  rates.seed(rate('r-med-60', 'market', 'city-medellin', 100000));
  rates.seed(rate('r-med-90', 'market', 'city-medellin', 140000, 90));
  rates.seed(rate('r-cali-60', 'market', 'city-cali', 120000));
  resolver = new CommissionResolver(settings, zones, markets, rates);
});

describe('CommissionResolver.resolveForMatch — zone, then market, then country', () => {
  it('uses the most specific configured level for each zone', async () => {
    expect((await resolver.resolveForMatch('zone-laureles', { modality: 'futbol_11' }))?.id).toBe('c-lau');
    expect((await resolver.resolveForMatch('zone-poblado', { modality: 'futbol_11' }))?.id).toBe('c-med');
    expect((await resolver.resolveForMatch('zone-cali-norte', { modality: 'futbol_11' }))?.id).toBe('c-co');
  });

  it('answers null for a zone whose levels have no rule, and for an unknown zone', async () => {
    expect(await resolver.resolveForMatch('zone-cdmx', { modality: 'any' })).toBeNull();
    expect(await resolver.resolveForMatch('zone-missing', { modality: 'any' })).toBeNull();
  });

  it('within a level prefers the modality tier, then the general one, before the next level (feature 024)', async () => {
    settings.seed(rule('c-med-f11', 'market', 'city-medellin', 8500, 0, { modality: 'futbol_11' }));
    expect((await resolver.resolveForMatch('zone-poblado', { modality: 'futbol_11' }))?.id).toBe('c-med-f11');
    expect((await resolver.resolveForMatch('zone-poblado', { modality: 'futbol_medio' }))?.id).toBe('c-med');
    expect((await resolver.resolveForMatch('zone-laureles', { modality: 'futbol_11' }))?.id).toBe('c-lau');
  });
});

describe('CommissionResolver.resolveForMatch — the viewer’s own rule (feature 033, FR-008/FR-010/FR-010a)', () => {
  it('prefers the goalkeeper’s active rule over every geography level', async () => {
    settings.seed(rule('c-g', 'goalkeeper', 'user-1', 0, 500, { countryId: 'country-co' }));
    expect((await resolver.resolveForMatch('zone-laureles', { modality: 'futbol_11' }, viewer))?.id).toBe('c-g');
    expect((await resolver.resolveForMatch('zone-laureles', { modality: 'futbol_11' }))?.id).toBe('c-lau');
  });

  it('ignores an expired rule and one from another country', async () => {
    settings.seed(rule('c-expired', 'goalkeeper', 'user-1', 0, 500, { countryId: 'country-co', validUntil: new Date('2026-10-17T11:59:00Z') }));
    expect((await resolver.resolveForMatch('zone-laureles', { modality: 'futbol_11' }, viewer))?.id).toBe('c-lau');
    settings.clear();
    settings.seed(rule('c-co', 'country', 'country-co', 7000));
    settings.seed(rule('c-mx', 'goalkeeper', 'user-1', 0, 500, { countryId: 'country-mx' }));
    expect((await resolver.resolveForMatch('zone-cali-norte', { modality: 'futbol_11' }, viewer))?.id).toBe('c-co');
  });

  it('applies the modality tiers inside the goalkeeper level too', async () => {
    settings.seed(rule('c-g', 'goalkeeper', 'user-1', 0, 500, { countryId: 'country-co' }));
    settings.seed(rule('c-g-f11', 'goalkeeper', 'user-1', 0, 300, { countryId: 'country-co', modality: 'futbol_11' }));
    expect((await resolver.resolveForMatch('zone-laureles', { modality: 'futbol_11' }, viewer))?.id).toBe('c-g-f11');
    expect((await resolver.resolveForMatch('zone-laureles', { modality: 'futbol_medio' }, viewer))?.id).toBe('c-g');
  });

  it('a rule that is still valid at the instant before its expiry applies; at the expiry it does not', async () => {
    settings.seed(rule('c-g', 'goalkeeper', 'user-1', 5000, 0, { countryId: 'country-co', validUntil: now }));
    expect((await resolver.resolveForMatch('zone-laureles', { modality: 'any' }, { goalkeeperId: 'user-1', now: new Date(now.getTime() - 1) }))?.id).toBe('c-g');
    expect((await resolver.resolveForMatch('zone-laureles', { modality: 'any' }, viewer))?.id).toBe('c-lau');
  });
});

describe('CommissionResolver.lowestForGoalkeepers — the "can see offers" threshold (FR-017)', () => {
  const lowest = async (goalkeeperId: string, zoneIds: string[]) => Object.fromEntries((await resolver.lowestForGoalkeepers([{ goalkeeperId, zoneIds }], now)).get(goalkeeperId)!.lowest);

  it('a fixed rule costs its fixed amount whatever the rates', async () => {
    expect(await lowest('user-2', ['zone-laureles', 'zone-poblado', 'zone-cali-norte'])).toEqual({ 'zone-laureles': 9000, 'zone-poblado': 8000, 'zone-cali-norte': 7000 });
  });

  it('a percent rule is applied to the lowest rate of the zone (zone rates, else market rates, any duration)', async () => {
    settings.clear();
    settings.seed(rule('c-co-pct', 'country', 'country-co', 0, 1000));
    rates.seed(rate('r-lau-60', 'zone', 'zone-laureles', 80000));
    expect(await lowest('user-2', ['zone-laureles', 'zone-poblado', 'zone-cali-norte'])).toEqual({ 'zone-laureles': 8000, 'zone-poblado': 10000, 'zone-cali-norte': 12000 });
  });

  it('takes the lowest net over the modality tiers', async () => {
    settings.seed(rule('c-med-f5', 'market', 'city-medellin', 0, 100, { modality: 'futbol_medio' }));
    rates.seed(rate('r-med-f5', 'market', 'city-medellin', 60000, 60, 'futbol_medio'));
    expect(await lowest('user-2', ['zone-poblado'])).toEqual({ 'zone-poblado': 600 });
  });

  it('uses the goalkeeper’s own active rule, per goalkeeper', async () => {
    settings.seed(rule('c-g', 'goalkeeper', 'user-1', 0, 500, { countryId: 'country-co' }));
    const result = await resolver.lowestForGoalkeepers(
      [
        { goalkeeperId: 'user-1', zoneIds: ['zone-poblado'] },
        { goalkeeperId: 'user-2', zoneIds: ['zone-poblado'] },
      ],
      now,
    );
    expect(result.get('user-1')?.lowest.get('zone-poblado')).toBe(5000);
    expect(result.get('user-2')?.lowest.get('zone-poblado')).toBe(8000);
    expect(result.get('user-1')?.ownRules.map((rule) => rule.id)).toEqual(['c-g']);
    expect(result.get('user-2')?.ownRules).toEqual([]);
    expect(settings.calls).toBe(1);
  });

  it('is null without a rule or for an unknown zone; a fixed rule needs no rate, a percent rule does', async () => {
    expect(await lowest('user-2', ['zone-cdmx', 'zone-missing'])).toEqual({ 'zone-cdmx': null, 'zone-missing': null });
    rates.clear();
    expect(await lowest('user-2', ['zone-laureles'])).toEqual({ 'zone-laureles': 9000 });
    settings.clear();
    settings.seed(rule('c-co-pct', 'country', 'country-co', 0, 1000));
    expect(await lowest('user-2', ['zone-laureles'])).toEqual({ 'zone-laureles': null });
  });

  it('reads nothing for nobody', async () => {
    expect((await resolver.lowestForGoalkeepers([], now)).size).toBe(0);
    expect(settings.calls).toBe(0);
  });
});
