import type { IMarketUsage, MarketUsage } from '../../src/application/features/markets/common/marketUsage.js';

/** Uses are set by hand per market; a market with none may be deleted. */
export class FakeMarketUsage implements IMarketUsage {
  readonly uses = new Map<string, MarketUsage>();

  async marketUsage(marketId: string): Promise<MarketUsage | null> {
    return this.uses.get(marketId) ?? null;
  }
}
