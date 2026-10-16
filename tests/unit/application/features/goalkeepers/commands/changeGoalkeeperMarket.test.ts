import { beforeEach, describe, expect, it } from 'vitest';
import { ChangeGoalkeeperMarketCommand } from '../../../../../../src/application/features/goalkeepers/commands/changeGoalkeeperMarket/changeGoalkeeperMarketCommand.js';
import { ChangeGoalkeeperMarketCommandHandler } from '../../../../../../src/application/features/goalkeepers/commands/changeGoalkeeperMarket/changeGoalkeeperMarketCommandHandler.js';
import { AccountClosure } from '../../../../../../src/domain/accountClosures/accountClosure.js';
import { Country } from '../../../../../../src/domain/countries/country.js';
import { Deposit } from '../../../../../../src/domain/deposits/deposit.js';
import { Zone } from '../../../../../../src/domain/zones/zone.js';
import { FakeAccountClosureRepository } from '../../../../../fakes/fakeAccountClosureRepository.js';
import { FakeBookingRepository } from '../../../../../fakes/fakeBookingRepository.js';
import { FixedClock } from '../../../../../fakes/fakeClock.js';
import { FakeCountryRepository } from '../../../../../fakes/fakeCountryRepository.js';
import { FakeDepositRepository } from '../../../../../fakes/fakeDepositRepository.js';
import { FakeGoalkeeperMarketChangeStore } from '../../../../../fakes/fakeGoalkeeperMarketChangeStore.js';
import { FakeGoalkeeperProfileRepository } from '../../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeGoalkeeperRegistrationRepository } from '../../../../../fakes/fakeGoalkeeperRegistrationRepository.js';
import { FakeMarketRepository, testMarket } from '../../../../../fakes/fakeMarketRepository.js';
import { FakeOperatingBalanceStore } from '../../../../../fakes/fakeOperatingBalanceStore.js';
import { FakeZoneRepository } from '../../../../../fakes/fakeZoneRepository.js';
import { buildGoalkeeperProfile } from '../../../../../fixtures/operatingBalanceFixtures.js';
import { buildRequest, buildRequestBookings } from '../../../../../fixtures/quoteFixtures.js';

const NOW = new Date('2026-10-15T12:00:00.000Z');
const polygon = { type: 'Polygon' as const, coordinates: [[[0, 0]]] };
const zone = (id: string, marketId: string, active = true) => new Zone({ id, marketId, name: id, slug: id, geometry: polygon, active, displayOrder: 1 });

let h: ReturnType<typeof world>;

function world() {
  const markets = new FakeMarketRepository();
  markets.seed(testMarket({ id: 'med', name: 'Medellín', countryId: 'co' }));
  markets.seed(testMarket({ id: 'bog', name: 'Bogotá', countryId: 'co' }));
  markets.seed(testMarket({ id: 'gye', name: 'Guayaquil', countryId: 'ec' }));
  markets.seed(testMarket({ id: 'cal', name: 'Cali', countryId: 'co', status: 'draft' }));
  const zones = new FakeZoneRepository();
  [zone('z-bello', 'med'), zone('z-chapinero', 'bog'), zone('z-off', 'bog', false), zone('z-gye', 'gye')].forEach((item) => zones.seed(item));
  const countries = new FakeCountryRepository();
  countries.seed(new Country({ id: 'co', name: 'Colombia', dialCode: '+57', countryCode: 'CO', currency: 'COP' }));
  countries.seed(new Country({ id: 'ec', name: 'Ecuador', dialCode: '+593', countryCode: 'EC', currency: 'USD' }));
  const profiles = new FakeGoalkeeperProfileRepository();
  profiles.seed(buildGoalkeeperProfile('gk-1', { marketId: 'med', zoneIds: ['z-bello'] }));
  const bookings = new FakeBookingRepository();
  const balances = new FakeOperatingBalanceStore(() => NOW);
  const deposits = new FakeDepositRepository();
  const closures = new FakeAccountClosureRepository();
  const store = new FakeGoalkeeperMarketChangeStore({ profiles, bookings, balances, deposits, closures });
  const handler = new ChangeGoalkeeperMarketCommandHandler({
    profiles,
    registrations: new FakeGoalkeeperRegistrationRepository(),
    markets,
    zones,
    countries,
    store,
    clock: new FixedClock(NOW.toISOString()),
  });
  const change = (marketId: string, zoneIds: string[], userId = 'gk-1') => handler.handle(new ChangeGoalkeeperMarketCommand(userId, marketId, zoneIds));
  /** An administrator's adjustment, in either direction. */
  const fund = (amount: number) =>
    balances.append({
      id: `mv-${amount}`,
      goalkeeperId: 'gk-1',
      type: 'admin_adjustment',
      amount,
      currency: 'COP',
      occurredAt: NOW,
      causeKey: `adjustment:${amount}`,
      actor: { kind: 'admin', userId: 'staff-1' },
      references: {},
      cancellation: null,
      reason: 'Prueba',
      invoicing: { documentType: 'CC', documentNumber: '1020304050' },
      marketId: 'city-cali',
    } as Parameters<FakeOperatingBalanceStore['append']>[0]);
  return { markets, profiles, bookings, balances, deposits, closures, store, change, fund };
}

beforeEach(() => {
  h = world();
});

describe('ChangeGoalkeeperMarketCommandHandler (spec 031, data-model §7)', () => {
  it('moves the goalkeeper to another market of the country with its zones, leaving the old ones', async () => {
    const result = await h.change('bog', ['z-chapinero']);

    expect(result).toMatchObject({ outcome: 'changed', goalkeeper: { marketId: 'bog', serviceZoneIds: ['z-chapinero'], market: { id: 'bog', name: 'Bogotá' } } });
    expect(await h.profiles.getByUserId('gk-1')).toMatchObject({ marketId: 'bog', zoneIds: ['z-chapinero'], marketChangedAt: NOW });
    expect((await h.profiles.findOfferCandidates(['z-bello'])).map((profile) => profile.userId)).not.toContain('gk-1');
  });

  it('refuses a market that is not enabled, the current one, and zones that are not its own', async () => {
    expect(await h.change('cal', ['z-chapinero'])).toEqual({ outcome: 'market_not_available' });
    expect(await h.change('nope', ['z-chapinero'])).toEqual({ outcome: 'market_not_available' });
    expect(await h.change('med', ['z-bello'])).toEqual({ outcome: 'same_market' });
    expect(await h.change('bog', ['z-bello', 'z-off'])).toEqual({ outcome: 'invalid_zones', invalidZoneIds: ['z-bello', 'z-off'] });
    expect(await h.change('bog', [])).toEqual({ outcome: 'invalid_zones', invalidZoneIds: [] });
    expect((await h.profiles.getByUserId('gk-1'))!.marketId).toBe('med');
  });

  it('refuses while the goalkeeper holds a booking not played yet, naming it', async () => {
    const [booking] = buildRequestBookings(buildRequest('r-1', new Date('2026-10-20T20:00:00.000Z'), { marketId: 'med', zoneId: 'z-bello' }));
    h.bookings.seed(booking!.assign('gk-1', NOW));

    expect(await h.change('bog', ['z-chapinero'])).toEqual({ outcome: 'pending_bookings', bookingIds: [booking!.id] });
  });

  it('within the country, keeps the balance and allows a pending deposit', async () => {
    await h.fund(20000);
    h.deposits.put(Deposit.start({ id: 'd-1', goalkeeperId: 'gk-1', countryId: 'co', marketId: 'city-cali', gateway: 'wompi', environment: 'sandbox', amount: 10000, cost: 0, currency: 'COP', now: NOW }));

    expect((await h.change('bog', ['z-chapinero'])).outcome).toBe('changed');
    expect(await h.balances.findByGoalkeeperId('gk-1')).toMatchObject({ balance: 20000, currency: 'COP' });
  });

  it('to another country, refuses a balance, a pending deposit and an open closure', async () => {
    await h.fund(20000);
    expect(await h.change('gye', ['z-gye'])).toEqual({ outcome: 'balance_not_zero', balance: 20000, currency: 'COP' });

    const empty = world();
    empty.deposits.put(Deposit.start({ id: 'd-1', goalkeeperId: 'gk-1', countryId: 'co', marketId: 'city-cali', gateway: 'wompi', environment: 'sandbox', amount: 10000, cost: 0, currency: 'COP', now: NOW }));
    expect(await empty.change('gye', ['z-gye'])).toEqual({ outcome: 'deposit_pending', depositId: 'd-1' });

    const closing = world();
    await closing.closures.add(AccountClosure.request({ id: 'cl-1', userId: 'gk-1', role: 'goalkeeper', balanceAtRequest: 0, currency: 'COP', now: NOW }));
    expect(await closing.change('gye', ['z-gye'])).toEqual({ outcome: 'account_closure_open' });
  });

  it('to another country with a zero balance, moves the balance to the new currency and keeps old movements in theirs', async () => {
    await h.fund(20000);
    await h.fund(-20000);

    expect((await h.change('gye', ['z-gye'])).outcome).toBe('changed');
    expect(await h.balances.findByGoalkeeperId('gk-1')).toMatchObject({ balance: 0, currency: 'USD' });
    expect(h.balances.movements().map((movement) => movement.currency)).toEqual(['COP', 'COP']);
  });

  it('leaves nothing half done when the transaction fails', async () => {
    h.store.failBeforeWriting = true;

    await expect(h.change('bog', ['z-chapinero'])).rejects.toThrow('transaction aborted');
    expect(await h.profiles.getByUserId('gk-1')).toMatchObject({ marketId: 'med', zoneIds: ['z-bello'], marketChangedAt: null });
  });

  it('answers not_a_goalkeeper for someone without a profile', async () => {
    expect(await h.change('bog', ['z-chapinero'], 'nobody')).toEqual({ outcome: 'not_a_goalkeeper' });
  });
});
