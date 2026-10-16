import type { Request } from 'express';

/** The markets of a member who holds only some (spec 031, FR-042); `undefined` when they hold all. */
function allowedMarkets(req: Request): readonly string[] | undefined {
  const allowed = req.adminScope?.allowedMarketIds;
  return allowed === undefined || allowed === 'all' ? undefined : allowed;
}

/**
 * What a market-level list is limited to by `X-Scope` (spec 031, contract B1): the selected market,
 * or every market of the selected country; for a member who holds only some markets, those.
 */
export function marketScopeCriteria(req: Request): { countryId?: string; marketId?: string; marketIds?: readonly string[] } {
  const scope = req.adminScope;
  if (!scope) return {};
  const marketIds = scope.marketId ? undefined : allowedMarkets(req);
  return {
    ...(scope.countryId ? { countryId: scope.countryId } : {}),
    ...(scope.marketId ? { marketId: scope.marketId } : {}),
    ...(marketIds ? { marketIds } : {}),
  };
}

/**
 * What a country-level list is limited to: the selected country (a selected market stands for its
 * country), the section's own optional `?marketId=`, and the markets a partial member holds.
 */
export function countryScopeCriteria(req: Request, marketId?: string): { countryId?: string; marketId?: string; marketIds?: readonly string[] } {
  const countryId = req.adminScope?.countryId ?? undefined;
  const allowed = allowedMarkets(req);
  // A market the member does not hold matches nothing.
  if (marketId && allowed && !allowed.includes(marketId)) return { ...(countryId ? { countryId } : {}), marketIds: [] };
  return { ...(countryId ? { countryId } : {}), ...(marketId ? { marketId } : {}), ...(allowed && !marketId ? { marketIds: allowed } : {}) };
}

/** The same for readers that filter by markets only: `?marketId=` becomes a one-market list. */
export function countryScopeFilter(req: Request, marketId?: string): { countryId?: string; marketIds?: readonly string[] } {
  const { marketId: one, ...rest } = countryScopeCriteria(req, marketId);
  return one ? { ...rest, marketIds: [one] } : rest;
}

/**
 * Whether the member may open a record of this market (spec 031, FR-038): it is checked against
 * what they hold, never the current selection. A record without a market is the platform's.
 */
export function canSeeMarket(req: Request, marketId: string | null | undefined): boolean {
  const allowed = allowedMarkets(req);
  return !allowed || (marketId !== null && marketId !== undefined && allowed.includes(marketId));
}
