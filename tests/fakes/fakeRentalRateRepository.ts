import type { IRentalRateRepository } from '../../src/application/features/goalkeeperRequests/common/ports.js';
import type { RentalRate } from '../../src/domain/pricing/rentalRate.js';

export class FakeRentalRateRepository implements IRentalRateRepository {
  private readonly rates: RentalRate[] = [];

  seed(rate: RentalRate): void {
    this.rates.push(rate);
  }

  /** Removes every seeded rate, e.g. to simulate an area nobody has priced. */
  clear(): void {
    this.rates.length = 0;
  }

  async findForDuration(
    zoneId: string,
    cityId: string,
    durationMinutes: number,
  ): Promise<{ zone: RentalRate[]; city: RentalRate[] }> {
    const forDuration = this.rates.filter((rate) => rate.durationMinutes === durationMinutes);
    return {
      zone: forDuration.filter((rate) => rate.scope === 'zone' && rate.refId === zoneId),
      city: forDuration.filter((rate) => rate.scope === 'city' && rate.refId === cityId),
    };
  }
}
