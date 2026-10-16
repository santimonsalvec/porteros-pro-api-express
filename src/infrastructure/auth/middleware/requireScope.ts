import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Country } from '../../../domain/countries/country.js';
import type { Market } from '../../../domain/markets/market.js';
import { fullCountryIds, hasPlatformScope, scopedMarketIds } from '../../../domain/staff/staffScope.js';

/** Which data a route works on (spec 031, FR-034): one market's, one country's, or the platform's. */
export type ScopeLevel = 'market' | 'country' | 'platform';

/**
 * The selection of this request (`X-Scope`) and what the member may see (research §14). `all`
 * means everything the member holds; `countryId` is the market's own country when a market is
 * selected.
 */
export interface AdminScope {
  level: ScopeLevel;
  kind: 'all' | 'country' | 'market';
  countryId: string | null;
  marketId: string | null;
  allowedCountryIds: string[] | 'all';
  allowedMarketIds: string[] | 'all';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminScope?: AdminScope;
    }
  }
}

export interface RequireScopeDependencies {
  markets: { getById(id: string): Promise<Market | null>; listByCountry(countryId: string): Promise<Market[]>; list(): Promise<Market[]> };
  countries: { getById(id: string): Promise<Country | null> };
}

export interface RequireScopeOptions {
  /** Called on a `scope_denied`, to leave a `denied` line in the audit log. */
  onDenied?: (req: Request) => void;
}

type Selection = { kind: 'all' } | { kind: 'country'; id: string } | { kind: 'market'; id: string };

function parse(header: string | undefined): Selection | null {
  if (header === undefined || header.trim() === '' || header === 'all') return { kind: 'all' };
  const match = /^(country|market):(.+)$/.exec(header.trim());
  if (!match) return null;
  return { kind: match[1] as 'country' | 'market', id: match[2]! };
}

const sorted = (ids: Iterable<string>) => [...new Set(ids)].sort();

/**
 * Reads `X-Scope` after `requireAdminAuth` (spec 031, contract B1): `400 invalid_scope` when it
 * is malformed, `404 scope_not_found` when the country or market does not exist, `403
 * scope_denied` when the member does not hold it. No header means everything the member holds.
 * Platform routes ignore it.
 */
export function requireScope(level: ScopeLevel, deps: RequireScopeDependencies, options: RequireScopeOptions = {}): RequestHandler {
  const fail = (res: Response, status: number, error: string, message: string) => void res.status(status).json({ error, message });

  return async (req: Request, res: Response, next: NextFunction) => {
    const access = req.adminAccess;
    if (!access) {
      res.status(401).end();
      return;
    }
    const platform = hasPlatformScope(access.scopes, access.isOwner);
    const base = { level, allowedCountryIds: 'all' as string[] | 'all', allowedMarketIds: 'all' as string[] | 'all' };
    if (!platform) {
      const countries = fullCountryIds(access.scopes);
      const marketIds = scopedMarketIds(access.scopes);
      const [own, ofCountries] = await Promise.all([
        Promise.all(marketIds.map((id) => deps.markets.getById(id))),
        Promise.all(countries.map((id) => deps.markets.listByCountry(id))),
      ]);
      base.allowedCountryIds = sorted([...countries, ...own.flatMap((market) => (market ? [market.countryId] : []))]);
      base.allowedMarketIds = sorted([...marketIds, ...ofCountries.flat().map((market) => market.id)]);
    }
    if (level === 'platform') {
      req.adminScope = { ...base, kind: 'all', countryId: null, marketId: null };
      next();
      return;
    }

    const selection = parse(req.header('x-scope'));
    if (!selection) {
      fail(res, 400, 'invalid_scope', 'X-Scope must be all, country:<id> or market:<id>.');
      return;
    }
    const holds = (list: string[] | 'all', id: string) => list === 'all' || list.includes(id);
    const denied = () => {
      options.onDenied?.(req);
      fail(res, 403, 'scope_denied', 'You do not have access to that country or market.');
    };

    if (selection.kind === 'all') {
      req.adminScope = { ...base, kind: 'all', countryId: null, marketId: null };
    } else if (selection.kind === 'country') {
      if (!(await deps.countries.getById(selection.id))) return fail(res, 404, 'scope_not_found', 'That country does not exist.');
      if (!holds(base.allowedCountryIds, selection.id)) return denied();
      req.adminScope = { ...base, kind: 'country', countryId: selection.id, marketId: null };
    } else {
      const market = await deps.markets.getById(selection.id);
      if (!market) return fail(res, 404, 'scope_not_found', 'That market does not exist.');
      if (!holds(base.allowedMarketIds, market.id)) return denied();
      req.adminScope = { ...base, kind: 'market', countryId: market.countryId, marketId: market.id };
    }
    next();
  };
}
