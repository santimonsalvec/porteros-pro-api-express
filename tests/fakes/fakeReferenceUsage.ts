import type {
  IFutureBookingsProbe,
  IReadinessSummary,
  IReferenceUsage,
  ReadinessSummary,
  UsageReason,
} from '../../src/application/features/geography/common/ports.js';
import type { City } from '../../src/domain/locations/city.js';

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

  async hasFutureRequestsInArea(anchorCityId: string): Promise<boolean> {
    return this.areasWithFutureRequests.has(anchorCityId);
  }
}

/** Every operating city is ready unless set otherwise. */
export class FakeReadinessSummary implements IReadinessSummary {
  readonly summaries = new Map<string, ReadinessSummary>();

  async summarize(cities: City[]): Promise<Map<string, ReadinessSummary>> {
    return new Map(cities.map((city) => [city.id, this.summaries.get(city.id) ?? { ready: true, missingCount: 0 }]));
  }
}
