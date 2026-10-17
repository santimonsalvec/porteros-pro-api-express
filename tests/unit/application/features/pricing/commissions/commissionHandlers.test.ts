import { beforeEach, describe, expect, it } from 'vitest';
import { Country } from '../../../../../../src/domain/countries/country.js';
import { CommissionSetting } from '../../../../../../src/domain/operatingBalance/commissionSetting.js';
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
const commission = (id: string, scope: 'country' | 'market' | 'zone', refId: string, fixedAmount: number, modality: string | null = null, percentBps = 0) =>
  kit.commissions.base.seed(new CommissionSetting({ id, scope, refId, fixedAmount, percentBps, modality }));

beforeEach(() => {
  kit = pricingKit();
});

describe('CreateCommissionCommand', () => {
  const create = (input: Partial<CreateCommissionCommand['input']> = {}) =>
    new CreateCommissionCommandHandler(kit).handle(
      new CreateCommissionCommand({ scope: 'country', refId: 'co', modality: null, fixedAmount: 7000, percentBps: 0, ...input }),
    );

  it('creates a country, a market and a zone commission', async () => {
    expect(await create()).toEqual({ outcome: 'saved', commissionId: 'new-1' });
    expect(await create({ scope: 'market', refId: 'med', fixedAmount: 8000 })).toEqual({ outcome: 'saved', commissionId: 'new-2' });
    expect(await create({ scope: 'zone', refId: 'poblado', fixedAmount: 9000 })).toEqual({ outcome: 'saved', commissionId: 'new-3' });
  });

  it('creates a percent-only and a mixed rule (feature 033)', async () => {
    expect(await create({ fixedAmount: 0, percentBps: 1000 })).toEqual({ outcome: 'saved', commissionId: 'new-1' });
    expect(await create({ scope: 'market', refId: 'med', fixedAmount: 3000, percentBps: 1000 })).toEqual({ outcome: 'saved', commissionId: 'new-2' });
    expect(kit.commissions.base.settings.map((setting) => [setting.kind, setting.fixedAmount, setting.percentBps])).toEqual([
      ['percent', 0, 1000],
      ['mixed', 3000, 1000],
    ]);
  });

  it('refuses the same combination, an unknown country and a country without currency', async () => {
    commission('c-co', 'country', 'co', 7000);
    kit.countries.items.set('ve', new Country({ id: 've', name: 'Venezuela', dialCode: '+58', countryCode: 'VE', currency: null }));
    expect(await create()).toEqual({ outcome: 'duplicate', existingId: 'c-co' });
    expect(await create({ refId: 'pe' })).toEqual({ outcome: 'country_not_found' });
    expect(await create({ refId: 've' })).toEqual({ outcome: 'country_without_currency' });
  });

  it('refuses the open modality and an amount above the limit', async () => {
    expect(await create({ modality: 'any' as never, fixedAmount: 100_000_001 })).toEqual({
      outcome: 'invalid',
      fieldErrors: { modality: 'unknown_modality', fixedAmount: 'above_limit' },
    });
  });

  it('refuses a rule with both components at zero, a percentage above 100 % and a negative fixed amount', async () => {
    expect(await create({ fixedAmount: 0, percentBps: 0 })).toEqual({ outcome: 'invalid', fieldErrors: { fixedAmount: 'at_least_one', percentBps: 'at_least_one' } });
    expect(await create({ percentBps: 10001 })).toEqual({ outcome: 'invalid', fieldErrors: { percentBps: 'out_of_range' } });
    expect(await create({ fixedAmount: -1 })).toEqual({ outcome: 'invalid', fieldErrors: { fixedAmount: 'not_a_whole_amount' } });
  });

  it('refuses a validity on a geography rule', async () => {
    expect(await create({ validUntilLocal: '2026-12-31T23:59' })).toEqual({ outcome: 'invalid', fieldErrors: { validUntilLocal: 'only_for_goalkeeper' } });
  });
});

describe('UpdateCommissionCommand and DeleteCommissionCommand', () => {
  beforeEach(() => commission('c-co', 'country', 'co', 7000));

  it('replaces both components, at the revision read', async () => {
    const handler = new UpdateCommissionCommandHandler(kit);
    expect(await handler.handle(new UpdateCommissionCommand('c-co', 0, { fixedAmount: 0, percentBps: 1250 }))).toEqual({ outcome: 'saved', commissionId: 'c-co' });
    expect(kit.commissions.base.settings[0]).toMatchObject({ fixedAmount: 0, percentBps: 1250, kind: 'percent', revision: 1 });
    expect(await handler.handle(new UpdateCommissionCommand('c-co', 0, { fixedAmount: 7600, percentBps: 0 }))).toEqual({ outcome: 'stale' });
    expect(await handler.handle(new UpdateCommissionCommand('nope', 0, { fixedAmount: 1, percentBps: 0 }))).toEqual({ outcome: 'not_found' });
  });

  it('refuses both components at zero and a validity on a geography rule', async () => {
    const handler = new UpdateCommissionCommandHandler(kit);
    expect(await handler.handle(new UpdateCommissionCommand('c-co', 0, { fixedAmount: 0, percentBps: 0 }))).toEqual({
      outcome: 'invalid',
      fieldErrors: { fixedAmount: 'at_least_one', percentBps: 'at_least_one' },
    });
    expect(await handler.handle(new UpdateCommissionCommand('c-co', 0, { fixedAmount: 7000, percentBps: 0, validUntilLocal: null }))).toEqual({
      outcome: 'invalid',
      fieldErrors: { validUntilLocal: 'only_for_goalkeeper' },
    });
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
    commission('c-med-f11', 'market', 'med', 8500, 'futbol_11');
    commission('c-co', 'country', 'co', 7000);
    commission('c-bello', 'zone', 'bello', 3000, null, 1000);
  });

  const list = (filters: ListCommissionsQuery['filters'] = {}) => new ListCommissionsQueryHandler(kit).handle(new ListCommissionsQuery(filters, 1, 20));

  it('lists country first, then markets, then zones by display order, each with its kind, and the VAT only for fixed rules', async () => {
    const result = await list();
    expect(result.items.map((item) => item.id)).toEqual(['c-co', 'c-med-f11', 'c-bello', 'c-poblado']);
    expect(result.items[0]).toMatchObject({ countryName: 'Colombia', currency: 'COP', kind: 'fixed', fixedAmount: 7000, percentBps: 0, vatRateBps: 1900, vatAmount: 1330, totalWithVat: 8330 });
    expect(result.items[2]).toMatchObject({ zoneName: 'Bello', kind: 'mixed', fixedAmount: 3000, percentBps: 1000, vatAmount: null, totalWithVat: null });
    expect(result.items[3]).toMatchObject({ zoneName: 'El Poblado', marketName: 'Medellín', vatAmount: 1710, totalWithVat: 10710 });
  });

  it('filters by scope, market, zone and modality', async () => {
    expect((await list({ scope: 'zone' })).items.map((item) => item.id)).toEqual(['c-bello', 'c-poblado']);
    expect((await list({ marketId: 'med' })).items.map((item) => item.id)).toEqual(['c-med-f11', 'c-bello', 'c-poblado']);
    expect((await list({ zoneId: 'poblado' })).items.map((item) => item.id)).toEqual(['c-poblado']);
    expect((await list({ modality: 'futbol_11' })).items.map((item) => item.id)).toEqual(['c-med-f11']);
  });

  it('charges no VAT in a country without it', async () => {
    const result = await new ListCommissionsQueryHandler({ ...kit, taxSettings: new FakeTaxSettingsRepository() }).handle(new ListCommissionsQuery({ scope: 'country' }, 1, 20));
    expect(result.items[0]).toMatchObject({ vatRateBps: 0, vatAmount: 0, totalWithVat: 7000 });
  });

  it('reads one, or not found', async () => {
    const handler = new GetCommissionQueryHandler(kit);
    expect(await handler.handle(new GetCommissionQuery('c-poblado'))).toMatchObject({ outcome: 'ok', commission: { id: 'c-poblado', fixedAmount: 9000, kind: 'fixed' } });
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
