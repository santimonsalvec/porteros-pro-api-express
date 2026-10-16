import { beforeEach, describe, expect, it } from 'vitest';
import { DeleteMarketCommand } from '../../../../../../src/application/features/markets/commands/deleteMarket/deleteMarketCommand.js';
import { DeleteMarketCommandHandler } from '../../../../../../src/application/features/markets/commands/deleteMarket/deleteMarketCommandHandler.js';
import { DisableMarketCommand } from '../../../../../../src/application/features/markets/commands/disableMarket/disableMarketCommand.js';
import { DisableMarketCommandHandler } from '../../../../../../src/application/features/markets/commands/disableMarket/disableMarketCommandHandler.js';
import { EnableMarketCommand } from '../../../../../../src/application/features/markets/commands/enableMarket/enableMarketCommand.js';
import { EnableMarketCommandHandler } from '../../../../../../src/application/features/markets/commands/enableMarket/enableMarketCommandHandler.js';
import { GetMarketReadinessQuery } from '../../../../../../src/application/features/markets/queries/getMarketReadiness/getMarketReadinessQuery.js';
import { GetMarketReadinessQueryHandler } from '../../../../../../src/application/features/markets/queries/getMarketReadiness/getMarketReadinessQueryHandler.js';
import { FixedClock } from '../../../../../fakes/fakeClock.js';
import { FakeMarketRepository, testMarket } from '../../../../../fakes/fakeMarketRepository.js';
import { FakeMarketUsage } from '../../../../../fakes/fakeMarketUsage.js';
import { FakeReadinessSummary } from '../../../../../fakes/fakeReferenceUsage.js';

const RATES_MISSING = { key: 'rentalRates', status: 'missing' as const, detail: 'Falta la tarifa de 60 min', target: { kind: 'admin' as const, screen: 'rentalRates' as const } };
const ZONES_OK = { key: 'zones', status: 'ok' as const, detail: '2 zonas activas', target: { kind: 'admin' as const, screen: 'zones' as const } };

let markets: FakeMarketRepository;
let readiness: FakeReadinessSummary;
let usage: FakeMarketUsage;
let deps: { markets: FakeMarketRepository; readiness: FakeReadinessSummary; marketUsage: FakeMarketUsage; clock: FixedClock };

beforeEach(() => {
  markets = new FakeMarketRepository();
  markets.seed(testMarket({ id: 'bog', name: 'Bogotá', countryId: 'co', status: 'draft' }));
  markets.seed(testMarket({ id: 'med', name: 'Medellín', countryId: 'co', status: 'enabled' }));
  readiness = new FakeReadinessSummary();
  usage = new FakeMarketUsage();
  deps = { markets, readiness, marketUsage: usage, clock: new FixedClock('2026-10-15T12:00:00.000Z') };
});

const enable = (marketId: string, revision = 0) => new EnableMarketCommandHandler(deps).handle(new EnableMarketCommand(marketId, revision, 'staff-1'));
const disable = (marketId: string, reason: string | null, revision = 0) =>
  new DisableMarketCommandHandler(deps).handle(new DisableMarketCommand(marketId, revision, reason, 'staff-1'));
const remove = (marketId: string, revision = 0) => new DeleteMarketCommandHandler(deps).handle(new DeleteMarketCommand(marketId, revision));

describe('EnableMarketCommandHandler (spec 031, FR-008)', () => {
  it('enables a ready draft market, recording who and when', async () => {
    expect(await enable('bog')).toEqual({ outcome: 'enabled' });
    expect(markets.markets.get('bog')).toMatchObject({ status: 'enabled', enabledBy: 'staff-1', enabledAt: new Date('2026-10-15T12:00:00.000Z'), revision: 1 });
  });

  it('refuses a market whose checklist is not complete, naming only what is missing', async () => {
    readiness.results.set('bog', { ready: false, missingCount: 1, items: [ZONES_OK, RATES_MISSING] });

    expect(await enable('bog')).toEqual({ outcome: 'not_ready', items: [RATES_MISSING] });
    expect(markets.markets.get('bog')!.status).toBe('draft');
  });

  it('refuses an enabled market, a stale revision and an unknown one', async () => {
    expect(await enable('med')).toEqual({ outcome: 'already_enabled' });
    expect(await enable('bog', 3)).toEqual({ outcome: 'stale' });
    expect(await enable('nope')).toEqual({ outcome: 'not_found' });
  });

  it('enables a disabled market again', async () => {
    await disable('med', 'Temporada baja');
    expect(await enable('med', 1)).toEqual({ outcome: 'enabled' });
  });
});

describe('DisableMarketCommandHandler (spec 031, FR-009)', () => {
  it('disables an enabled market with a reason', async () => {
    expect(await disable('med', 'Temporada baja')).toEqual({ outcome: 'disabled' });
    expect(markets.markets.get('med')).toMatchObject({ status: 'disabled', disabledBy: 'staff-1', revision: 1 });
  });

  it('asks a reason, and refuses a market that is not enabled or a stale revision', async () => {
    expect(await disable('med', null)).toEqual({ outcome: 'reason_required' });
    expect(await disable('med', '  ')).toEqual({ outcome: 'reason_required' });
    expect(await disable('bog', 'Cierre')).toEqual({ outcome: 'not_enabled' });
    expect(await disable('med', 'Cierre', 5)).toEqual({ outcome: 'stale' });
    expect(await disable('nope', 'Cierre')).toEqual({ outcome: 'not_found' });
  });
});

describe('DeleteMarketCommandHandler (spec 031, data-model §12)', () => {
  it('deletes a market nothing points at', async () => {
    expect(await remove('bog')).toEqual({ outcome: 'deleted' });
    expect(markets.markets.has('bog')).toBe(false);
  });

  it('refuses a market in use, naming the first kind of record and its count', async () => {
    usage.uses.set('bog', { kind: 'zones', count: 2 });

    expect(await remove('bog')).toEqual({ outcome: 'in_use', kind: 'zones', count: 2 });
    expect(markets.markets.has('bog')).toBe(true);
  });

  it('refuses a stale revision and an unknown market', async () => {
    expect(await remove('bog', 2)).toEqual({ outcome: 'stale' });
    expect(await remove('nope')).toEqual({ outcome: 'not_found' });
  });
});

describe('GetMarketReadinessQueryHandler', () => {
  it("returns the market's checklist, or not found", async () => {
    readiness.results.set('bog', { ready: false, missingCount: 1, items: [ZONES_OK, RATES_MISSING] });
    const handler = new GetMarketReadinessQueryHandler(deps);

    expect(await handler.handle(new GetMarketReadinessQuery('bog'))).toEqual({
      outcome: 'ok',
      readiness: { ready: false, missingCount: 1, items: [ZONES_OK, RATES_MISSING] },
    });
    expect(await handler.handle(new GetMarketReadinessQuery('nope'))).toEqual({ outcome: 'not_found' });
  });
});
