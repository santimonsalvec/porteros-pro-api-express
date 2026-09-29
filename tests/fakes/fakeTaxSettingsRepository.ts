import type { ITaxSettingsRepository } from '../../src/application/features/wallet/common/ports.js';
import { TaxSetting } from '../../src/domain/wallet/taxSetting.js';

export class FakeTaxSettingsRepository implements ITaxSettingsRepository {
  private readonly state = new Map<string, TaxSetting>();

  /** Colombia at 19 % by default. */
  seed(countryId = 'country-co', vatRateBps = 1900): TaxSetting {
    const setting = TaxSetting.rehydrate({ countryId, vatRateBps, updatedAt: new Date('2026-09-28T00:00:00.000Z'), updatedBy: 'admin-seed' });
    this.state.set(countryId, setting);
    return setting;
  }

  async getByCountry(countryId: string): Promise<TaxSetting | null> {
    return this.state.get(countryId) ?? null;
  }

  async save(setting: TaxSetting): Promise<void> {
    this.state.set(setting.countryId, setting);
  }
}
