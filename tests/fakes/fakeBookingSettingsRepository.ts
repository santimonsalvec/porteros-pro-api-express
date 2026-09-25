import type { IBookingSettingsRepository } from '../../src/application/features/goalkeeperRequests/common/ports.js';
import type { BookingSettings } from '../../src/domain/pricing/bookingSettings.js';

export class FakeBookingSettingsRepository implements IBookingSettingsRepository {
  private readonly settings: BookingSettings[] = [];

  seed(settings: BookingSettings): void {
    this.settings.push(settings);
  }

  /** Removes every seeded document, e.g. to simulate an unconfigured area. */
  clear(): void {
    this.settings.length = 0;
  }

  async findFor(
    cityId: string,
    countryId: string | null,
  ): Promise<{ city: BookingSettings | null; country: BookingSettings | null }> {
    return {
      city: this.settings.find((item) => item.scope === 'city' && item.refId === cityId) ?? null,
      country:
        countryId === null ? null : (this.settings.find((item) => item.scope === 'country' && item.refId === countryId) ?? null),
    };
  }
}
