import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import type { AdminScope } from '../../../../src/infrastructure/auth/middleware/requireScope.js';
import { canSeeMarket, countryScopeCriteria, countryScopeFilter, marketScopeCriteria } from '../../../../src/controllers/admin/scopeCriteria.js';

const withScope = (scope: Partial<AdminScope> | undefined) => ({ adminScope: scope } as unknown as Request);

describe('scopeCriteria (spec 031, contract B1)', () => {
  it('limits a market-level list to the selected market, or the selected country', () => {
    expect(marketScopeCriteria(withScope(undefined))).toEqual({});
    expect(marketScopeCriteria(withScope({ countryId: 'co', marketId: 'med', allowedMarketIds: 'all' }))).toEqual({ countryId: 'co', marketId: 'med' });
    expect(marketScopeCriteria(withScope({ countryId: 'co', marketId: null, allowedMarketIds: 'all' }))).toEqual({ countryId: 'co' });
  });

  it('keeps a partial member within the markets they hold', () => {
    expect(marketScopeCriteria(withScope({ countryId: 'co', marketId: null, allowedMarketIds: ['med'] }))).toEqual({ countryId: 'co', marketIds: ['med'] });
    // A selected market is already one they hold: no second filter.
    expect(marketScopeCriteria(withScope({ countryId: 'co', marketId: 'med', allowedMarketIds: ['med'] }))).toEqual({ countryId: 'co', marketId: 'med' });
  });

  it('limits a country-level list to the country, with an optional market of it', () => {
    expect(countryScopeCriteria(withScope({ countryId: 'co', allowedMarketIds: 'all' }))).toEqual({ countryId: 'co' });
    expect(countryScopeCriteria(withScope({ countryId: 'co', allowedMarketIds: 'all' }), 'med')).toEqual({ countryId: 'co', marketId: 'med' });
    expect(countryScopeCriteria(withScope({ countryId: null, allowedMarketIds: ['med', 'bog'] }))).toEqual({ marketIds: ['med', 'bog'] });
  });

  it('answers nothing for a market the partial member does not hold', () => {
    expect(countryScopeCriteria(withScope({ countryId: 'co', allowedMarketIds: ['med'] }), 'bog')).toEqual({ countryId: 'co', marketIds: [] });
    expect(countryScopeCriteria(withScope({ countryId: 'co', allowedMarketIds: ['med'] }), 'med')).toEqual({ countryId: 'co', marketId: 'med' });
  });

  it('turns ?marketId= into a one-market list for readers that filter by markets only', () => {
    expect(countryScopeFilter(withScope({ countryId: 'co', allowedMarketIds: 'all' }), 'med')).toEqual({ countryId: 'co', marketIds: ['med'] });
    expect(countryScopeFilter(withScope({ countryId: 'co', allowedMarketIds: ['med'] }))).toEqual({ countryId: 'co', marketIds: ['med'] });
  });

  it('lets a record be opened only within the markets held; platform records need no market', () => {
    expect(canSeeMarket(withScope({ allowedMarketIds: 'all' }), 'bog')).toBe(true);
    expect(canSeeMarket(withScope({ allowedMarketIds: 'all' }), null)).toBe(true);
    expect(canSeeMarket(withScope({ allowedMarketIds: ['med'] }), 'med')).toBe(true);
    expect(canSeeMarket(withScope({ allowedMarketIds: ['med'] }), 'bog')).toBe(false);
    expect(canSeeMarket(withScope({ allowedMarketIds: ['med'] }), null)).toBe(false);
  });
});
