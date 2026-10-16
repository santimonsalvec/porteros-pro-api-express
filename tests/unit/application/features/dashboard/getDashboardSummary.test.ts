import { beforeEach, describe, expect, it } from 'vitest';
import type { DashboardReadContext, IDashboardGeography, IDashboardReader } from '../../../../../src/application/features/dashboard/common/ports.js';
import { emptyStatusCounts } from '../../../../../src/application/features/dashboard/common/areas.js';
import { GetDashboardSummaryQuery } from '../../../../../src/application/features/dashboard/queries/getDashboardSummary/getDashboardSummaryQuery.js';
import { GetDashboardSummaryQueryHandler } from '../../../../../src/application/features/dashboard/queries/getDashboardSummary/getDashboardSummaryQueryHandler.js';
import { BOOKING_STATUSES } from '../../../../../src/domain/bookings/booking.js';
import type { Permission } from '../../../../../src/domain/staff/permissionCatalog.js';

const NOW = new Date('2026-10-13T14:00:00.000Z');
const REQUEST_STATUSES = ['searching', 'partially_assigned', 'assigned', 'completed', 'cancelled', 'expired', 'closed'] as const;

const geography: IDashboardGeography = {
  countryExists: async (id) => id === 'co',
  getMarket: async (id) => (id === 'medellin' ? { id, countryId: 'co', timeZone: 'America/Bogota' } : id === 'cdmx' ? { id, countryId: 'mx', timeZone: 'America/Mexico_City' } : null),
  marketsOfCountry: async () => [{ id: 'medellin', countryId: 'co', timeZone: 'America/Bogota' }],
};

const ALL: Permission[] = ['dashboard.read', 'requests.read', 'goalkeepers.read', 'goalkeepers.registrations.review', 'cases.read', 'invoicing.read', 'deposits.read', 'operating_balances.read'];

describe('GetDashboardSummaryQueryHandler (admin spec 008, research §1)', () => {
  let calls: string[];
  let contexts: DashboardReadContext[];
  let goalkeeperLookups: number;
  let warnings: Record<string, unknown>[];
  let failing: Set<string>;
  let handler: GetDashboardSummaryQueryHandler;

  beforeEach(() => {
    calls = [];
    contexts = [];
    goalkeeperLookups = 0;
    warnings = [];
    failing = new Set();
    const area = <T>(name: string, value: T) => async (context: DashboardReadContext) => {
      calls.push(name);
      contexts.push(context);
      if (failing.has(name)) throw new Error(`boom ${name}`);
      return value;
    };
    const reader: IDashboardReader = {
      goalkeeperIdsInMarkets: async () => {
        goalkeeperLookups += 1;
        return ['gk-1'];
      },
      requests: area('requests', {
        requests: { today: emptyStatusCounts(REQUEST_STATUSES), week: emptyStatusCounts(REQUEST_STATUSES) },
        bookings: { today: emptyStatusCounts(BOOKING_STATUSES), week: emptyStatusCounts(BOOKING_STATUSES), weekByDay: [] },
      }),
      goalkeepers: area('goalkeepers', { active: 1, available: 1, suspended: 0, blocked: 0 }),
      registrations: area('registrations', { inProgress: 2 }),
      cases: area('cases', { open: 3 }),
      invoicing: async (context) => {
        calls.push('invoicing');
        await context.goalkeeperIds();
        return { rejected: 1, stale: 0 };
      },
      deposits: async (context) => {
        calls.push('deposits');
        await context.goalkeeperIds();
        return { pending: 4 };
      },
      operatingBalances: async (context) => {
        calls.push('operatingBalances');
        await context.goalkeeperIds();
        if (failing.has('operatingBalances')) throw new Error('boom operatingBalances');
        return { byCurrency: [] };
      },
    };
    handler = new GetDashboardSummaryQueryHandler({
      reader,
      geography,
      clock: { now: () => NOW },
      logger: { warn: (entry) => warnings.push(entry) },
    });
  });

  it('computes only the areas the permissions allow, and leaves the others out', async () => {
    const result = await handler.handle(new GetDashboardSummaryQuery({}, ['dashboard.read', 'requests.read', 'cases.read']));
    expect(result.outcome).toBe('ok');
    if (result.outcome !== 'ok') return;
    expect(Object.keys(result.summary.areas).sort()).toEqual(['cases', 'requests']);
    expect(calls.sort()).toEqual(['cases', 'requests']);
    expect(result.summary.areas.cases).toEqual({ status: 'ok', open: 3 });
    expect(result.summary.computedAt).toEqual(NOW);
  });

  it('returns no areas for a member who can only see the dashboard', async () => {
    const result = await handler.handle(new GetDashboardSummaryQuery({}, ['dashboard.read']));
    expect(result).toMatchObject({ outcome: 'ok', summary: { areas: {} } });
    expect(calls).toEqual([]);
  });

  it('marks a failing area as failed, logs it without data and keeps the others', async () => {
    failing.add('cases');
    const result = await handler.handle(new GetDashboardSummaryQuery({}, ALL));
    if (result.outcome !== 'ok') throw new Error('expected ok');
    expect(result.summary.areas.cases).toEqual({ status: 'failed' });
    expect(result.summary.areas.registrations).toEqual({ status: 'ok', inProgress: 2 });
    expect(Object.keys(result.summary.areas)).toHaveLength(7);
    expect(warnings).toEqual([{ outcome: 'dashboard_area_failed', area: 'cases', err: expect.any(Error) }]);
  });

  it('answers a scope error without reading any area', async () => {
    expect(await handler.handle(new GetDashboardSummaryQuery({ countryId: 'co', marketId: 'cdmx' }, ALL))).toEqual({ outcome: 'market_not_in_country' });
    expect(await handler.handle(new GetDashboardSummaryQuery({ marketId: 'medellin' }, ALL))).toEqual({ outcome: 'invalid' });
    expect(await handler.handle(new GetDashboardSummaryQuery({ countryId: 'pe' }, ALL))).toEqual({ outcome: 'country_not_found' });
    expect(calls).toEqual([]);
  });

  it("hands each area the scope and today's and this week's windows, and the scope back", async () => {
    const result = await handler.handle(new GetDashboardSummaryQuery({ countryId: 'co', marketId: 'medellin' }, ['dashboard.read', 'cases.read']));
    if (result.outcome !== 'ok') throw new Error('expected ok');
    expect(result.summary.scope).toEqual({
      countryId: 'co',
      marketId: 'medellin',
      timeZone: 'America/Bogota',
      timeZoneSource: 'market',
      timeZoneFallback: null,
      today: { from: new Date('2026-10-13T05:00:00.000Z'), to: new Date('2026-10-14T05:00:00.000Z') },
      week: { from: new Date('2026-10-12T05:00:00.000Z'), to: new Date('2026-10-19T05:00:00.000Z') },
    });
    expect(contexts[0]).toMatchObject({ now: NOW, scope: { marketIds: ['medellin'] }, windows: { days: expect.any(Array) } });
  });

  it("looks the scope's goalkeepers up once for every area that needs them, and not at all for the platform", async () => {
    await handler.handle(new GetDashboardSummaryQuery({ countryId: 'co' }, ALL));
    expect(goalkeeperLookups).toBe(1);
    goalkeeperLookups = 0;
    await handler.handle(new GetDashboardSummaryQuery({}, ALL));
    expect(goalkeeperLookups).toBe(0);
  });
});
