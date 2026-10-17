import type { IRentalRateRepository } from '../../src/application/features/goalkeeperRequests/common/ports.js';
import type { RentalRate } from '../../src/domain/pricing/rentalRate.js';
import type { IRatePresence } from '../../src/application/features/geography/common/ports.js';

export class FakeRentalRateRepository implements IRentalRateRepository, IRatePresence {
  /** The stored rates, shared with the admin web's fake (spec 004 of the admin). */
  readonly rates: RentalRate[] = [];

  seed(rate: RentalRate): void {
    this.rates.push(rate);
  }

  /** Removes every seeded rate, e.g. to simulate an area nobody has priced. */
  clear(): void {
    this.rates.length = 0;
  }

  async findForDuration(
    zoneId: string,
    marketId: string,
    durationMinutes: number,
  ): Promise<{ zone: RentalRate[]; market: RentalRate[] }> {
    const forDuration = this.rates.filter((rate) => rate.durationMinutes === durationMinutes);
    return {
      zone: forDuration.filter((rate) => rate.scope === 'zone' && rate.refId === zoneId),
      market: forDuration.filter((rate) => rate.scope === 'market' && rate.refId === marketId),
    };
  }

  async findForZones(zoneIds: readonly string[], marketIds: readonly string[]): Promise<RentalRate[]> {
    return this.rates.filter((rate) => (rate.scope === 'zone' ? zoneIds : marketIds).includes(rate.refId));
  }

  async pricedDurations(refs: { marketIds: string[]; zoneIds: string[] }) {
    return this.rates
      .filter((rate) => (rate.scope === 'market' ? refs.marketIds : refs.zoneIds).includes(rate.refId))
      .map((rate) => ({ scope: rate.scope as 'market' | 'zone', refId: rate.refId, durationMinutes: rate.durationMinutes }));
  }
}
