import { beforeEach, describe, expect, it } from 'vitest';
import { ListUnverifiedDiscountsQuery } from '../../../../../../src/application/features/pricing/queries/listUnverifiedDiscounts/listUnverifiedDiscountsQuery.js';
import { ListUnverifiedDiscountsQueryHandler } from '../../../../../../src/application/features/pricing/queries/listUnverifiedDiscounts/listUnverifiedDiscountsQueryHandler.js';
import { CreateUnverifiedDiscountCommand } from '../../../../../../src/application/features/pricing/commands/createUnverifiedDiscount/createUnverifiedDiscountCommand.js';
import { CreateUnverifiedDiscountCommandHandler } from '../../../../../../src/application/features/pricing/commands/createUnverifiedDiscount/createUnverifiedDiscountCommandHandler.js';
import { UpdateUnverifiedDiscountCommand } from '../../../../../../src/application/features/pricing/commands/updateUnverifiedDiscount/updateUnverifiedDiscountCommand.js';
import { UpdateUnverifiedDiscountCommandHandler } from '../../../../../../src/application/features/pricing/commands/updateUnverifiedDiscount/updateUnverifiedDiscountCommandHandler.js';
import { DeleteUnverifiedDiscountCommand } from '../../../../../../src/application/features/pricing/commands/deleteUnverifiedDiscount/deleteUnverifiedDiscountCommand.js';
import { DeleteUnverifiedDiscountCommandHandler } from '../../../../../../src/application/features/pricing/commands/deleteUnverifiedDiscount/deleteUnverifiedDiscountCommandHandler.js';
import { FakeUnverifiedDiscountRepository } from '../../../../../fakes/fakeUnverifiedDiscountRepository.js';
import { pricingKit } from '../pricingTestKit.js';

let kit: ReturnType<typeof pricingKit> & { discounts: FakeUnverifiedDiscountRepository };

beforeEach(() => {
  kit = { ...pricingKit(), discounts: new FakeUnverifiedDiscountRepository() };
});

describe('ListUnverifiedDiscountsQuery (admin spec 030, contracts D1)', () => {
  it('shows each level of the country with its own value and what it inherits', async () => {
    kit.discounts.seed('country', 'co', 1000);
    kit.discounts.seed('zone', 'poblado', 1500);

    const result = await new ListUnverifiedDiscountsQueryHandler(kit).handle(new ListUnverifiedDiscountsQuery('co'));

    expect(result.outcome).toBe('ok');
    if (result.outcome !== 'ok') return;
    expect(result.view.maxBps).toBe(3000);
    expect(result.view.maxPriorityMinutes).toBe(1440);
    expect(result.view.country).toEqual({
      id: 'co',
      name: 'Colombia',
      setting: { id: 'country-co', discountBps: 1000, verifiedPriorityMinutes: null, revision: 0 },
      effective: { discountBps: 1000, discountOrigin: 'country', verifiedPriorityMinutes: 15, priorityOrigin: 'default' },
    });
    expect(result.view.cities.find((city) => city.id === 'med')).toEqual({
      id: 'med',
      name: 'Medellín',
      setting: null,
      effective: { discountBps: 1000, discountOrigin: 'country', verifiedPriorityMinutes: 15, priorityOrigin: 'default' },
    });
    expect(result.view.zones.find((zone) => zone.id === 'poblado')).toMatchObject({ cityId: 'med', setting: { discountBps: 1500 }, effective: { discountBps: 1500, discountOrigin: 'zone' } });
    expect(result.view.zones.find((zone) => zone.id === 'bello')).toMatchObject({ setting: null, effective: { discountBps: 1000, discountOrigin: 'country' } });
  });

  it('is not found for an unknown country', async () => {
    expect(await new ListUnverifiedDiscountsQueryHandler(kit).handle(new ListUnverifiedDiscountsQuery('zz'))).toEqual({ outcome: 'not_found' });
  });
});

describe('the unverified discount commands (contracts D2–D4)', () => {
  const create = (input: Partial<CreateUnverifiedDiscountCommand['input']> = {}) =>
    new CreateUnverifiedDiscountCommandHandler(kit).handle(new CreateUnverifiedDiscountCommand({ scope: 'country', refId: 'co', discountBps: 1000, verifiedPriorityMinutes: null, ...input }));

  it('creates a level, once', async () => {
    expect(await create()).toEqual({ outcome: 'saved', id: 'new-1' });
    expect(await create({ scope: 'zone', refId: 'poblado', discountBps: 0 })).toEqual({ outcome: 'saved', id: 'new-2' });
    expect(await create()).toEqual({ outcome: 'duplicate', existingId: 'new-1' });
  });

  it('a level may set only the verified-only window, and needs at least one value', async () => {
    expect(await create({ discountBps: null, verifiedPriorityMinutes: 30 })).toEqual({ outcome: 'saved', id: 'new-1' });
    expect(await create({ scope: 'city', refId: 'med', discountBps: null, verifiedPriorityMinutes: null })).toEqual({ outcome: 'invalid', fieldErrors: { discountBps: expect.any(String) } });
    expect(await create({ scope: 'city', refId: 'med', discountBps: null, verifiedPriorityMinutes: 1441 })).toEqual({
      outcome: 'invalid',
      fieldErrors: { verifiedPriorityMinutes: expect.any(String) },
    });
  });

  it('refuses above the 30 % ceiling, fractions and targets that are not a level', async () => {
    expect(await create({ discountBps: 3001 })).toEqual({ outcome: 'invalid', fieldErrors: { discountBps: expect.any(String) } });
    expect(await create({ discountBps: 10.5 })).toEqual({ outcome: 'invalid', fieldErrors: { discountBps: expect.any(String) } });
    expect(await create({ scope: 'city', refId: 'env' })).toEqual({ outcome: 'city_not_anchor', anchorCityId: 'med' });
    expect(await create({ scope: 'zone', refId: 'nowhere' })).toEqual({ outcome: 'zone_not_found' });
  });

  it('updates and deletes at the revision read', async () => {
    const setting = kit.discounts.seed('city', 'med', 1000);
    const update = new UpdateUnverifiedDiscountCommandHandler(kit);
    const remove = new DeleteUnverifiedDiscountCommandHandler(kit);

    expect(await update.handle(new UpdateUnverifiedDiscountCommand(setting.id, 0, { discountBps: 1200, verifiedPriorityMinutes: null }))).toEqual({ outcome: 'saved', id: setting.id });
    expect(await update.handle(new UpdateUnverifiedDiscountCommand(setting.id, 0, { discountBps: 1300, verifiedPriorityMinutes: null }))).toEqual({ outcome: 'stale' });
    expect(await update.handle(new UpdateUnverifiedDiscountCommand(setting.id, 1, { discountBps: 3500, verifiedPriorityMinutes: null }))).toEqual({ outcome: 'invalid', fieldErrors: { discountBps: expect.any(String) } });
    expect(await update.handle(new UpdateUnverifiedDiscountCommand('missing', 0, { discountBps: 1000, verifiedPriorityMinutes: null }))).toEqual({ outcome: 'not_found' });

    expect(await remove.handle(new DeleteUnverifiedDiscountCommand(setting.id, 0))).toEqual({ outcome: 'stale' });
    expect(await remove.handle(new DeleteUnverifiedDiscountCommand(setting.id, 1))).toEqual({ outcome: 'deleted' });
    expect(await remove.handle(new DeleteUnverifiedDiscountCommand(setting.id, 1))).toEqual({ outcome: 'not_found' });
  });
});
