import { beforeEach, describe, expect, it } from 'vitest';
import { Country } from '../../../../../../src/domain/countries/country.js';
import { CommissionSetting } from '../../../../../../src/domain/wallet/commissionSetting.js';
import { CreateCommissionCommand } from '../../../../../../src/application/features/pricing/commands/createCommission/createCommissionCommand.js';
import { CreateCommissionCommandHandler } from '../../../../../../src/application/features/pricing/commands/createCommission/createCommissionCommandHandler.js';
import { UpdateCommissionCommand } from '../../../../../../src/application/features/pricing/commands/updateCommission/updateCommissionCommand.js';
import { UpdateCommissionCommandHandler } from '../../../../../../src/application/features/pricing/commands/updateCommission/updateCommissionCommandHandler.js';
import { DeleteCommissionCommand } from '../../../../../../src/application/features/pricing/commands/deleteCommission/deleteCommissionCommand.js';
import { DeleteCommissionCommandHandler } from '../../../../../../src/application/features/pricing/commands/deleteCommission/deleteCommissionCommandHandler.js';
import { ListCommissionsQuery } from '../../../../../../src/application/features/pricing/queries/listCommissions/listCommissionsQuery.js';
import { ListCommissionsQueryHandler } from '../../../../../../src/application/features/pricing/queries/listCommissions/listCommissionsQueryHandler.js';
import { GetCommissionQuery } from '../../../../../../src/application/features/pricing/queries/getCommission/getCommissionQuery.js';
import { GetCommissionQueryHandler } from '../../../../../../src/application/features/pricing/queries/getCommission/getCommissionQueryHandler.js';
import { GetCommissionDeleteImpactQuery } from '../../../../../../src/application/features/pricing/queries/getCommissionDeleteImpact/getCommissionDeleteImpactQuery.js';
import { GetCommissionDeleteImpactQueryHandler } from '../../../../../../src/application/features/pricing/queries/getCommissionDeleteImpact/getCommissionDeleteImpactQueryHandler.js';
import { FakeTaxSettingsRepository } from '../../../../../fakes/fakeTaxSettingsRepository.js';
import { pricingKit } from '../pricingTestKit.js';

let kit: ReturnType<typeof pricingKit>;
const commission = (id: string, scope: 'country' | 'city' | 'zone', refId: string, amount: number, modality: string | null = null) =>
  kit.commissions.base.seed(new CommissionSetting({ id, scope, refId, amount, modality, level: null }));

beforeEach(() => {
  kit = pricingKit();
});

describe('CreateCommissionCommand', () => {
  const create = (input: Partial<CreateCommissionCommand['input']> = {}) =>
    new CreateCommissionCommandHandler(kit).handle(
      new CreateCommissionCommand({ scope: 'country', refId: 'co', modality: null, level: null, amount: 7000, ...input }),
    );

  it('creates a country, an anchor-city and a zone commission', async () => {
    expect(await create()).toEqual({ outcome: 'saved', commissionId: 'new-1' });
    expect(await create({ scope: 'city', refId: 'med', amount: 8000 })).toEqual({ outcome: 'saved', commissionId: 'new-2' });
    expect(await create({ scope: 'zone', refId: 'poblado', amount: 9000 })).toEqual({ outcome: 'saved', commissionId: 'new-3' });
  });

  it('refuses the same combination, a satellite city, an unknown country and a country without currency', async () => {
    commission('c-co', 'country', 'co', 7000);
    kit.countries.items.set('ve', new Country({ id: 've', name: 'Venezuela', dialCode: '+58', countryCode: 'VE', currency: null }));
    expect(await create()).toEqual({ outcome: 'duplicate', existingId: 'c-co' });
    expect(await create({ scope: 'city', refId: 'env' })).toEqual({ outcome: 'city_not_anchor', anchorCityId: 'med' });
    expect(await create({ refId: 'pe' })).toEqual({ outcome: 'country_not_found' });
    expect(await create({ refId: 've' })).toEqual({ outcome: 'country_without_currency' });
  });

  it('refuses a level without a modality and an amount above the limit', async () => {
    expect(await create({ level: 'competitive', amount: 100_000_001 })).toEqual({
      outcome: 'invalid',
      fieldErrors: { level: 'level_requires_modality', amount: 'above_limit' },
    });
  });
});

describe('UpdateCommissionCommand and DeleteCommissionCommand', () => {
  beforeEach(() => commission('c-co', 'country', 'co', 7000));

  it('changes only the amount, at the revision read', async () => {
    const handler = new UpdateCommissionCommandHandler(kit);
    expect(await handler.handle(new UpdateCommissionCommand('c-co', 0, 7500))).toEqual({ outcome: 'saved', commissionId: 'c-co' });
    expect(await handler.handle(new UpdateCommissionCommand('c-co', 0, 7600))).toEqual({ outcome: 'stale' });
    expect(await handler.handle(new UpdateCommissionCommand('nope', 0, 1))).toEqual({ outcome: 'not_found' });
  });

  it('deletes', async () => {
    const handler = new DeleteCommissionCommandHandler(kit);
    expect(await handler.handle(new DeleteCommissionCommand('c-co'))).toEqual({ outcome: 'deleted' });
    expect(await handler.handle(new DeleteCommissionCommand('c-co'))).toEqual({ outcome: 'not_found' });
  });
});

describe('ListCommissionsQuery and GetCommissionQuery', () => {
  beforeEach(() => {
    commission('c-poblado', 'zone', 'poblado', 9000);
    commission('c-med-f11', 'city', 'med', 8500, 'futbol_11');
    commission('c-co', 'country', 'co', 7000);
    commission('c-bello', 'zone', 'bello', 8000);
  });

  const list = (filters: ListCommissionsQuery['filters'] = {}) => new ListCommissionsQueryHandler(kit).handle(new ListCommissionsQuery(filters, 1, 20));

  it('lists country first, then cities, then zones by display order, each with its VAT and total', async () => {
    const result = await list();
    expect(result.items.map((item) => item.id)).toEqual(['c-co', 'c-med-f11', 'c-bello', 'c-poblado']);
    expect(result.items[0]).toMatchObject({ countryName: 'Colombia', currency: 'COP', vatRateBps: 1900, vatAmount: 1330, totalWithVat: 8330 });
    expect(result.items[3]).toMatchObject({ zoneName: 'El Poblado', cityName: 'Medellín', vatAmount: 1710, totalWithVat: 10710 });
  });

  it('filters by scope, city, zone and modality', async () => {
    expect((await list({ scope: 'zone' })).items.map((item) => item.id)).toEqual(['c-bello', 'c-poblado']);
    expect((await list({ cityId: 'med' })).items.map((item) => item.id)).toEqual(['c-med-f11', 'c-bello', 'c-poblado']);
    expect((await list({ zoneId: 'poblado' })).items.map((item) => item.id)).toEqual(['c-poblado']);
    expect((await list({ modality: 'futbol_11' })).items.map((item) => item.id)).toEqual(['c-med-f11']);
  });

  it('charges no VAT in a country without it', async () => {
    const result = await new ListCommissionsQueryHandler({ ...kit, taxSettings: new FakeTaxSettingsRepository() }).handle(new ListCommissionsQuery({ scope: 'country' }, 1, 20));
    expect(result.items[0]).toMatchObject({ vatRateBps: 0, vatAmount: 0, totalWithVat: 7000 });
  });

  it('reads one, or not found', async () => {
    const handler = new GetCommissionQueryHandler(kit);
    expect(await handler.handle(new GetCommissionQuery('c-poblado'))).toMatchObject({ outcome: 'ok', commission: { id: 'c-poblado', amount: 9000 } });
    expect(await handler.handle(new GetCommissionQuery('nope'))).toEqual({ outcome: 'not_found' });
  });
});

describe('GetCommissionDeleteImpactQuery', () => {
  const impact = (id: string) => new GetCommissionDeleteImpactQueryHandler(kit).handle(new GetCommissionDeleteImpactQuery(id));

  it("names the active zones left without any commission when the country's only one goes", async () => {
    commission('c-co', 'country', 'co', 7000);
    commission('c-poblado', 'zone', 'poblado', 9000);
    expect(await impact('c-co')).toEqual({ outcome: 'ok', impact: { zoneCount: 2, zoneNames: ['Laureles', 'Bello'] } });
  });

  it('loses nothing when a wider level still covers the zone', async () => {
    commission('c-co', 'country', 'co', 7000);
    commission('c-poblado', 'zone', 'poblado', 9000);
    expect(await impact('c-poblado')).toEqual({ outcome: 'ok', impact: { zoneCount: 0, zoneNames: [] } });
  });

  it('is not found for an unknown commission', async () => {
    expect(await impact('nope')).toEqual({ outcome: 'not_found' });
  });
});
