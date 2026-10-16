import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { Country } from '../../../../../src/domain/countries/country.js';
import type { StaffScope } from '../../../../../src/domain/staff/staffScope.js';
import { requireScope, type ScopeLevel } from '../../../../../src/infrastructure/auth/middleware/requireScope.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { FakeMarketRepository, testMarket } from '../../../../fakes/fakeMarketRepository.js';

function world() {
  const markets = new FakeMarketRepository();
  markets.seed(testMarket({ id: 'med', name: 'Medellín', countryId: 'co' }));
  markets.seed(testMarket({ id: 'bog', name: 'Bogotá', countryId: 'co' }));
  markets.seed(testMarket({ id: 'gye', name: 'Guayaquil', countryId: 'ec' }));
  const countries = new FakeCountryRepository();
  countries.seed(new Country({ id: 'co', name: 'Colombia', dialCode: '+57', countryCode: 'CO', currency: 'COP' }));
  countries.seed(new Country({ id: 'ec', name: 'Ecuador', dialCode: '+593', countryCode: 'EC', currency: 'USD' }));
  return { markets, countries };
}

async function run(level: ScopeLevel, header: string | undefined, scopes: StaffScope[], isOwner = false) {
  const denied = vi.fn();
  const middleware = requireScope(level, world(), { onDenied: denied });
  const req = {
    header: (name: string) => (name.toLowerCase() === 'x-scope' ? header : undefined),
    adminAccess: { staffId: 's-1', userId: 'u-1', sessionId: 'x', email: 'a@b.co', roleId: 'r', permissions: [], isOwner, scopes },
  } as unknown as Request;
  const res = { statusCode: 200, body: undefined as unknown, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
  const next = vi.fn() as unknown as NextFunction;
  await middleware(req, res as unknown as Response, next);
  return { req, res, next: next as unknown as ReturnType<typeof vi.fn>, denied };
}

const PLATFORM: StaffScope[] = [{ kind: 'platform' }];

describe('requireScope (spec 031, contract B1)', () => {
  it.each([
    [undefined, { kind: 'all', countryId: null, marketId: null }],
    ['all', { kind: 'all', countryId: null, marketId: null }],
    ['country:co', { kind: 'country', countryId: 'co', marketId: null }],
    ['market:med', { kind: 'market', countryId: 'co', marketId: 'med' }],
  ])('reads X-Scope %s', async (header, scope) => {
    const { req, next } = await run('market', header, PLATFORM);
    expect(next).toHaveBeenCalled();
    expect(req.adminScope).toMatchObject({ ...scope, level: 'market', allowedCountryIds: 'all', allowedMarketIds: 'all' });
  });

  it('refuses a malformed value, and a country or market that does not exist', async () => {
    for (const header of ['nope', 'country:', 'market', 'zone:z-1']) {
      expect((await run('market', header, PLATFORM)).res).toMatchObject({ statusCode: 400, body: { error: 'invalid_scope' } });
    }
    expect((await run('market', 'country:xx', PLATFORM)).res).toMatchObject({ statusCode: 404, body: { error: 'scope_not_found' } });
    expect((await run('market', 'market:xx', PLATFORM)).res).toMatchObject({ statusCode: 404, body: { error: 'scope_not_found' } });
  });

  it('refuses what the member does not hold, leaving a denied line', async () => {
    const medellin: StaffScope[] = [{ kind: 'market', id: 'med' }];

    const other = await run('market', 'market:bog', medellin);
    const country = await run('country', 'country:ec', medellin);

    expect(other.res).toMatchObject({ statusCode: 403, body: { error: 'scope_denied' } });
    expect(country.res).toMatchObject({ statusCode: 403, body: { error: 'scope_denied' } });
    expect(other.denied).toHaveBeenCalledTimes(1);
  });

  it('works out what a member of markets and countries may see', async () => {
    const { req } = await run('market', undefined, [{ kind: 'country', id: 'ec' }, { kind: 'market', id: 'med' }]);
    expect(req.adminScope).toMatchObject({ kind: 'all', allowedCountryIds: ['co', 'ec'], allowedMarketIds: ['gye', 'med'] });

    const own = await run('country', 'country:co', [{ kind: 'market', id: 'med' }]);
    expect(own.req.adminScope).toMatchObject({ kind: 'country', countryId: 'co', allowedMarketIds: ['med'] });
  });

  it('treats the owner role as the platform', async () => {
    const { req } = await run('market', 'market:gye', [{ kind: 'market', id: 'med' }], true);
    expect(req.adminScope).toMatchObject({ kind: 'market', marketId: 'gye', allowedMarketIds: 'all' });
  });

  it('ignores the header on platform routes', async () => {
    const { req, next } = await run('platform', 'nope', [{ kind: 'market', id: 'med' }]);
    expect(next).toHaveBeenCalled();
    expect(req.adminScope).toMatchObject({ level: 'platform', kind: 'all' });
  });
});
