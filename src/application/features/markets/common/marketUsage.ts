/**
 * What may point at a market, in the order the delete checks it (spec 031, data-model §12):
 * zones; settings; goalkeepers; quotes, requests and bookings; records attributed to it; staff
 * scopes that name it.
 */
export const MARKET_USAGE_KINDS = ['zones', 'settings', 'goalkeepers', 'bookings', 'records', 'staffScopes'] as const;
export type MarketUsageKind = (typeof MARKET_USAGE_KINDS)[number];

/** The first kind with records, and how many of that kind there are. */
export interface MarketUsage {
  kind: MarketUsageKind;
  count: number;
}

export interface IMarketUsage {
  /** `null` when nothing points at the market, so it may be deleted. */
  marketUsage(marketId: string): Promise<MarketUsage | null>;
}
