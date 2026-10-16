import type { IBookingSettingsRepository } from '../../src/application/features/goalkeeperRequests/common/ports.js';
import type { BookingSettings } from '../../src/domain/pricing/bookingSettings.js';
import type { IBookingSettingsBatch } from '../../src/application/features/geography/common/ports.js';

export class FakeBookingSettingsRepository implements IBookingSettingsRepository, IBookingSettingsBatch {
  /** The stored levels, shared with the admin web's fake (spec 004 of the admin). */
  readonly settings: BookingSettings[] = [];

  seed(settings: BookingSettings): void {
    this.settings.push(settings);
  }

  /** Removes every seeded document, e.g. to simulate an unconfigured area. */
  clear(): void {
    this.settings.length = 0;
  }

  async findFor(
    marketId: string,
    countryId: string | null,
  ): Promise<{ market: BookingSettings | null; country: BookingSettings | null }> {
    return {
      market: this.settings.find((item) => item.scope === 'market' && item.refId === marketId) ?? null,
      country:
        countryId === null ? null : (this.settings.find((item) => item.scope === 'country' && item.refId === countryId) ?? null),
    };
  }

  async findMany(refs: { marketIds: string[]; countryIds: string[] }): Promise<BookingSettings[]> {
    return this.settings.filter((item) => (item.scope === 'market' ? refs.marketIds : refs.countryIds).includes(item.refId));
  }
}
