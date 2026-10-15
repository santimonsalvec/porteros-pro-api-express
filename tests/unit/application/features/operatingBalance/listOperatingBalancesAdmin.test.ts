import { describe, expect, it } from 'vitest';
import { ListOperatingBalancesAdminQuery } from '../../../../../src/application/features/operatingBalance/queries/listOperatingBalancesAdmin/listOperatingBalancesAdminQuery.js';
import { ListOperatingBalancesAdminQueryHandler } from '../../../../../src/application/features/operatingBalance/queries/listOperatingBalancesAdmin/listOperatingBalancesAdminQueryHandler.js';
import { Country } from '../../../../../src/domain/countries/country.js';
import { City } from '../../../../../src/domain/locations/city.js';
import { Region } from '../../../../../src/domain/locations/region.js';
import { User } from '../../../../../src/domain/users/user.js';
import { buildGoalkeeperProfile } from '../../../../fixtures/operatingBalanceFixtures.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeRegionRepository } from '../../../../fakes/fakeRegionRepository.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { FakeOperatingBalanceAdminReader } from '../../../../fakes/fakeOperatingBalanceAdminReader.js';
import { FakeOperatingBalanceStore } from '../../../../fakes/fakeOperatingBalanceStore.js';

// Admin spec 007, US3 (FR-001): the operating balances of goalkeepers with at least one movement.

function person(id: string, first: string, last: string) {
  const user = User.createFromExternalIdentity({ id, email: `${id}@x.co`, displayName: null, provider: 'google', subject: id });
  user.completeProfile(first, last, '+57', '3001234567');
  return user;
}

async function setup() {
  const operatingBalances = new FakeOperatingBalanceStore();
  const profiles = new FakeGoalkeeperProfileRepository();
  const cities = new FakeCityRepository();
  const regions = new FakeRegionRepository();
  const users = new FakeUserRepository();
  regions.seed(new Region({ id: 'region-valle', name: 'Valle', countryId: 'country-co' }));
  regions.seed(new Region({ id: 'region-lima', name: 'Lima', countryId: 'country-pe' }));
  cities.seed(new City({ id: 'city-cali', name: 'Cali', regionId: 'region-valle', zoneCityId: null, timeZone: 'America/Bogota' }));
  cities.seed(new City({ id: 'city-lima', name: 'Lima', regionId: 'region-lima', zoneCityId: null, timeZone: 'America/Lima' }));
  for (const [id, cityId, first, last] of [['gk-1', 'city-cali', 'Juan', 'Pérez'], ['gk-2', 'city-cali', 'Ana', 'Ruiz'], ['gk-3', 'city-lima', 'Luis', 'Soto'], ['gk-4', 'city-cali', 'Sin', 'Movimientos']] as const) {
    profiles.seed(buildGoalkeeperProfile(id, { cityId }));
    users.seed(person(id, first, last));
  }
  const movement = (goalkeeperId: string, amount: number) =>
    operatingBalances.append({
      id: `m-${goalkeeperId}`,
      goalkeeperId,
      currency: 'COP',
      type: 'admin_adjustment',
      amount,
      causeKey: `k-${goalkeeperId}`,
      occurredAt: new Date('2026-10-13T10:00:00.000Z'),
      actor: { kind: 'admin', userId: 'admin-1' },
      references: {},
      cancellation: null,
      reason: 'Prueba',
      invoicing: null,
    } as never);
  await movement('gk-1', 18536);
  await movement('gk-2', 5000);
  await movement('gk-3', 1000);
  const colombia = new Country({ id: 'country-co', name: 'Colombia', dialCode: '+57', countryCode: 'CO', currency: 'COP' });
  const handler = new ListOperatingBalancesAdminQueryHandler({
    reader: new FakeOperatingBalanceAdminReader({ operatingBalances, profiles, cities, regions }),
    users,
    cities,
    regions,
    countries: { getById: async (id: string) => (id === colombia.id ? colombia : null) },
  });
  return { handler, operatingBalances };
}

describe('ListOperatingBalancesAdminQueryHandler', () => {
  it('lists the operatingBalances, lowest balance first, with the goalkeeper, the city and the country', async () => {
    const { handler } = await setup();

    const result = await handler.handle(new ListOperatingBalancesAdminQuery({ sort: 'balance_asc', page: 1, pageSize: 20 }));

    expect(result.page.totalItems).toBe(3);
    expect(result.page.items.map((row) => row.goalkeeper.userId)).toEqual(['gk-3', 'gk-2', 'gk-1']);
    expect(result.page.items[2]).toEqual({
      goalkeeper: { userId: 'gk-1', name: 'Juan Pérez' },
      cityName: 'Cali',
      countryId: 'country-co',
      countryName: 'Colombia',
      balance: 18536,
      currency: 'COP',
      lastMovementAt: expect.any(String),
    });
  });

  it('keeps to a country and orders the other way', async () => {
    const { handler } = await setup();
    const result = await handler.handle(new ListOperatingBalancesAdminQuery({ countryId: 'country-co', sort: 'balance_desc', page: 1, pageSize: 20 }));
    expect(result.page.items.map((row) => row.goalkeeper.userId)).toEqual(['gk-1', 'gk-2']);
  });

  it('keeps to debts', async () => {
    const { handler } = await setup();
    const result = await handler.handle(new ListOperatingBalancesAdminQuery({ negative: true, sort: 'balance_asc', page: 1, pageSize: 20 }));
    expect(result.page.totalItems).toBe(0);
  });

  it('never lists a goalkeeper without movements', async () => {
    const { handler } = await setup();
    const result = await handler.handle(new ListOperatingBalancesAdminQuery({ sort: 'balance_asc', page: 1, pageSize: 20 }));
    expect(result.page.items.map((row) => row.goalkeeper.userId)).not.toContain('gk-4');
  });

  it('shows a operatingBalance whose goalkeeper has no city, or a city whose region has no country, without a place', async () => {
    const { handler, operatingBalances } = await setup();
    await operatingBalances.append({
      id: 'm-gk-5',
      goalkeeperId: 'gk-5',
      currency: 'COP',
      type: 'admin_adjustment',
      amount: 1,
      causeKey: 'k-gk-5',
      occurredAt: new Date('2026-10-13T10:00:00.000Z'),
      actor: { kind: 'admin', userId: 'admin-1' },
      references: {},
      cancellation: null,
      reason: 'Prueba',
      invoicing: null,
    } as never);

    const result = await handler.handle(new ListOperatingBalancesAdminQuery({ sort: 'balance_asc', page: 1, pageSize: 20 }));
    const row = result.page.items.find((item) => item.goalkeeper.userId === 'gk-5');
    expect(row).toMatchObject({ cityName: null, countryId: null, countryName: null, goalkeeper: { name: null } });
    const lima = result.page.items.find((item) => item.goalkeeper.userId === 'gk-3');
    expect(lima).toMatchObject({ cityName: 'Lima', countryId: 'country-pe', countryName: null });
  });
});
