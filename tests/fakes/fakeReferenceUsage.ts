import type {
  IFutureBookingsProbe,
  IReadinessSummary,
  IReferenceUsage,
  ReadinessSummary,
  UsageReason,
} from '../../src/application/features/geography/common/ports.js';
import type { ReadinessResult } from '../../src/application/features/geography/common/readiness.js';
import type { Market } from '../../src/domain/markets/market.js';

/** Uses are set by hand per id (or per code for document types). */
export class FakeReferenceUsage implements IReferenceUsage {
  readonly reasons = new Map<string, UsageReason>();
  readonly operatingCountries = new Set<string>();

  use(id: string, reason: UsageReason): this {
    this.reasons.set(id, reason);
    return this;
  }

  private reasonFor = async (id: string) => this.reasons.get(id) ?? null;

  regionUsage = this.reasonFor;
  cityUsage = this.reasonFor;
  zoneUsage = this.reasonFor;
  documentTypeUsage = this.reasonFor;
  surfaceUsage = this.reasonFor;

  private inUse = async (ids: string[]) => new Set(ids.filter((id) => this.reasons.has(id)));

  zonesInUse = this.inUse;
  documentTypesInUse = this.inUse;
  surfacesInUse = this.inUse;

  async countryOperates(countryId: string): Promise<boolean> {
    return this.operatingCountries.has(countryId);
  }
}

export class FakeFutureBookingsProbe implements IFutureBookingsProbe {
  readonly areasWithFutureRequests = new Set<string>();

  async hasFutureRequestsInArea(marketId: string): Promise<boolean> {
    return this.areasWithFutureRequests.has(marketId);
  }
}

/** Every market is ready unless set otherwise. */
export class FakeReadinessSummary implements IReadinessSummary {
  readonly summaries = new Map<string, ReadinessSummary>();
  /** The whole checklist of a market, for `check`. */
  readonly results = new Map<string, ReadinessResult>();

  async check(market: Market): Promise<ReadinessResult> {
    return this.results.get(market.id) ?? { ready: true, missingCount: 0, items: [] };
  }

  async summarize(markets: Market[]): Promise<Map<string, ReadinessSummary>> {
    return new Map(markets.map((market) => [market.id, this.summaries.get(market.id) ?? { ready: true, missingCount: 0 }]));
  }
}
