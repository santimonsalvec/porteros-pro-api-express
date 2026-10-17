import { beforeEach, describe, expect, it } from 'vitest';
import { CommissionSetting } from '../../../../../../src/domain/operatingBalance/commissionSetting.js';
import { CreateCommissionCommand } from '../../../../../../src/application/features/pricing/commands/createCommission/createCommissionCommand.js';
import { CreateCommissionCommandHandler } from '../../../../../../src/application/features/pricing/commands/createCommission/createCommissionCommandHandler.js';
import { UpdateCommissionCommand } from '../../../../../../src/application/features/pricing/commands/updateCommission/updateCommissionCommand.js';
import { UpdateCommissionCommandHandler } from '../../../../../../src/application/features/pricing/commands/updateCommission/updateCommissionCommandHandler.js';
import { ListCommissionsQuery } from '../../../../../../src/application/features/pricing/queries/listCommissions/listCommissionsQuery.js';
import { ListCommissionsQueryHandler } from '../../../../../../src/application/features/pricing/queries/listCommissions/listCommissionsQueryHandler.js';
import { GetCommissionDeleteImpactQuery } from '../../../../../../src/application/features/pricing/queries/getCommissionDeleteImpact/getCommissionDeleteImpactQuery.js';
import { GetCommissionDeleteImpactQueryHandler } from '../../../../../../src/application/features/pricing/queries/getCommissionDeleteImpact/getCommissionDeleteImpactQueryHandler.js';
import { GetGoalkeeperCommissionRulesQuery } from '../../../../../../src/application/features/pricing/queries/getGoalkeeperCommissionRules/getGoalkeeperCommissionRulesQuery.js';
import { GetGoalkeeperCommissionRulesQueryHandler } from '../../../../../../src/application/features/pricing/queries/getGoalkeeperCommissionRules/getGoalkeeperCommissionRulesQueryHandler.js';
import { Country } from '../../../../../../src/domain/countries/country.js';
import { pricingKit } from '../pricingTestKit.js';

let kit: ReturnType<typeof pricingKit>;
const seed = (id: string, scope: string, refId: string, fixedAmount: number, percentBps = 0, extra: Partial<ConstructorParameters<typeof CommissionSetting>[0]> = {}) =>
  kit.commissions.base.seed(new CommissionSetting({ id, scope, refId, fixedAmount, percentBps, ...extra }));
const create = (input: Partial<CreateCommissionCommand['input']> = {}) =>
  new CreateCommissionCommandHandler(kit).handle(new CreateCommissionCommand({ scope: 'goalkeeper', refId: 'gk-1', modality: null, fixedAmount: 0, percentBps: 500, ...input }));

beforeEach(() => {
  kit = pricingKit();
});

describe('a goalkeeper’s own rule (feature 033, US3)', () => {
  it('is bound to the country of the goalkeeper’s market and never expires by default', async () => {
    expect(await create()).toEqual({ outcome: 'saved', commissionId: 'new-1' });
    expect(kit.commissions.base.settings[0]).toMatchObject({ scope: 'goalkeeper', refId: 'gk-1', countryId: 'co', validUntil: null, percentBps: 500 });
  });

  it('reads the expiry in the market’s time zone, and refuses a past or nonexistent one', async () => {
    expect(await create({ validUntilLocal: '2026-10-31T23:59' })).toEqual({ outcome: 'saved', commissionId: 'new-1' });
    expect(kit.commissions.base.settings[0]?.validUntil?.toISOString()).toBe('2026-11-01T04:59:00.000Z');
    expect(await create({ modality: 'futbol_11', validUntilLocal: '2026-10-17T06:59' })).toEqual({ outcome: 'invalid', fieldErrors: { validUntilLocal: 'past' } });
    expect(await create({ modality: 'micro_futsal', validUntilLocal: '2026-13-01T00:00' })).toEqual({ outcome: 'invalid', fieldErrors: { validUntilLocal: 'nonexistent_local_time' } });
  });

  it('refuses a user who is not a goalkeeper, and a market whose country has no currency', async () => {
    expect(await create({ refId: 'nobody' })).toEqual({ outcome: 'goalkeeper_not_found' });
    kit.countries.items.set('co', new Country({ id: 'co', name: 'Colombia', dialCode: '+57', countryCode: 'CO', currency: null }));
    expect(await create()).toEqual({ outcome: 'country_without_currency' });
  });

  it('changes the expiry on update, and leaves it alone when not given', async () => {
    seed('own', 'goalkeeper', 'gk-1', 0, 500, { countryId: 'co', validUntil: new Date('2026-11-01T04:59:00.000Z') });
    const handler = new UpdateCommissionCommandHandler(kit);
    expect(await handler.handle(new UpdateCommissionCommand('own', 0, { fixedAmount: 1000, percentBps: 0 }))).toEqual({ outcome: 'saved', commissionId: 'own' });
    expect(kit.commissions.base.settings[0]).toMatchObject({ fixedAmount: 1000, validUntil: new Date('2026-11-01T04:59:00.000Z') });
    expect(await handler.handle(new UpdateCommissionCommand('own', 1, { fixedAmount: 1000, percentBps: 0, validUntilLocal: null }))).toEqual({ outcome: 'saved', commissionId: 'own' });
    expect(kit.commissions.base.settings[0]?.validUntil).toBeNull();
    expect(await handler.handle(new UpdateCommissionCommand('own', 2, { fixedAmount: 1000, percentBps: 0, validUntilLocal: '2020-01-01T00:00' }))).toEqual({ outcome: 'invalid', fieldErrors: { validUntilLocal: 'past' } });
  });

  it('is listed only when asked for by scope, with the goalkeeper’s name and its validity', async () => {
    seed('c-co', 'country', 'co', 7000);
    seed('own-active', 'goalkeeper', 'gk-1', 0, 500, { countryId: 'co' });
    seed('own-expired', 'goalkeeper', 'gk-1', 0, 300, { countryId: 'co', modality: 'futbol_11', validUntil: new Date('2026-10-17T11:59:00.000Z') });
    seed('own-mx', 'goalkeeper', 'gk-1', 0, 300, { countryId: 'mx', modality: 'micro_futsal' });
    const list = (filters: ListCommissionsQuery['filters'] = {}) => new ListCommissionsQueryHandler(kit).handle(new ListCommissionsQuery(filters, 1, 20));

    expect((await list()).items.map((item) => item.id)).toEqual(['c-co']);
    const own = (await list({ scope: 'goalkeeper' })).items;
    expect(own.map((item) => [item.id, (item as { validity?: string }).validity]).sort()).toEqual([
      ['own-active', 'active'],
      ['own-expired', 'expired'],
      ['own-mx', 'other_country'],
    ]);
    expect(own[0]).toMatchObject({ goalkeeper: { userId: 'gk-1', name: 'Juan Pérez' }, marketName: 'Medellín', currency: 'COP', timeZone: 'America/Bogota', validUntilLocal: null, kind: 'percent', vatAmount: null });
    expect(own.find((item) => item.id === 'own-expired')).toMatchObject({ validUntilLocal: '2026-10-17T06:59' });
  });

  it('deleting one leaves no zone bare: the impact names the general rule that takes over', async () => {
    seed('c-co', 'country', 'co', 7000);
    seed('c-med-f11', 'market', 'med', 3000, 1000, { modality: 'futbol_11' });
    seed('own', 'goalkeeper', 'gk-1', 0, 500, { countryId: 'co' });
    seed('own-f11', 'goalkeeper', 'gk-1', 0, 300, { countryId: 'co', modality: 'futbol_11' });
    const impact = (id: string) => new GetCommissionDeleteImpactQueryHandler(kit).handle(new GetCommissionDeleteImpactQuery(id));
    expect(await impact('own')).toEqual({ outcome: 'ok', impact: { zoneCount: 0, zoneNames: [], fallback: { fixedAmount: 7000, percentBps: 0, kind: 'fixed', origin: { scope: 'country', refId: 'co', name: 'Colombia' } } } });
    expect(await impact('own-f11')).toMatchObject({ impact: { fallback: { kind: 'mixed', origin: { scope: 'market', refId: 'med', name: 'Medellín' } } } });
    kit.commissions.base.clear();
    seed('own', 'goalkeeper', 'gk-1', 0, 500, { countryId: 'co' });
    expect(await impact('own')).toEqual({ outcome: 'ok', impact: { zoneCount: 0, zoneNames: [], fallback: null } });
  });
});

describe('GetGoalkeeperCommissionRulesQuery (the admin’s "Comisión" tab)', () => {
  const rules = (userId = 'gk-1') => new GetGoalkeeperCommissionRulesQueryHandler(kit).handle(new GetGoalkeeperCommissionRulesQuery(userId));

  it('gives the goalkeeper, their rules and the general rule per tier', async () => {
    seed('c-co', 'country', 'co', 7000);
    seed('c-med-f11', 'market', 'med', 0, 1000, { modality: 'futbol_11' });
    seed('own', 'goalkeeper', 'gk-1', 0, 500, { countryId: 'co' });
    const result = await rules();
    expect(result).toMatchObject({
      outcome: 'ok',
      rules: {
        goalkeeper: { userId: 'gk-1', name: 'Juan Pérez', marketId: 'med', marketName: 'Medellín', countryId: 'co', currency: 'COP', timeZone: 'America/Bogota' },
        general: [
          { modality: 'micro_futsal', rule: { kind: 'fixed', fixedAmount: 7000, origin: { scope: 'country', name: 'Colombia' } } },
          { modality: 'futbol_medio', rule: { kind: 'fixed', origin: { scope: 'country' } } },
          { modality: 'futbol_11', rule: { kind: 'percent', percentBps: 1000, origin: { scope: 'market', name: 'Medellín' } } },
          { modality: 'any', rule: { kind: 'fixed', origin: { scope: 'country' } } },
        ],
      },
    });
    expect(result.outcome === 'ok' && result.rules.rules.map((rule) => rule.id)).toEqual(['own']);
  });

  it('has no general rule where none is configured, and is not found for a non-goalkeeper', async () => {
    const result = await rules();
    expect(result.outcome === 'ok' && result.rules.general.every((tier) => tier.rule === null)).toBe(true);
    expect(await rules('nobody')).toEqual({ outcome: 'not_found' });
  });
});
