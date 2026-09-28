import type { ICommissionSettingRepository } from '../../src/application/features/wallet/common/ports.js';
import type { CommissionSetting } from '../../src/domain/wallet/commissionSetting.js';

export class FakeCommissionSettingRepository implements ICommissionSettingRepository {
  private readonly settings: CommissionSetting[] = [];
  calls = 0;

  seed(setting: CommissionSetting): void {
    this.settings.push(setting);
  }

  async findFor(refs: { zoneIds: string[]; cityIds: string[]; countryIds: string[] }): Promise<CommissionSetting[]> {
    this.calls += 1;
    return this.settings.filter(
      (setting) =>
        (setting.scope === 'zone' && refs.zoneIds.includes(setting.refId)) ||
        (setting.scope === 'city' && refs.cityIds.includes(setting.refId)) ||
        (setting.scope === 'country' && refs.countryIds.includes(setting.refId)),
    );
  }
}
