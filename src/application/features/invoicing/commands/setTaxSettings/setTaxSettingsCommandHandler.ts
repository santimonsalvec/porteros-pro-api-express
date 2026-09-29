import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { TaxSetting } from '../../../../../domain/wallet/taxSetting.js';
import type { ICountryLookup } from '../../../goalkeeperRequests/common/ports.js';
import type { ITaxSettingsRepository } from '../../../wallet/common/ports.js';
import type { IInvoicingLogger } from '../../common/ports.js';
import { SetTaxSettingsCommand, type SetTaxSettingsResult, type TaxSettingsResponse } from './setTaxSettingsCommand.js';

export function toTaxSettingsResponse(setting: TaxSetting): TaxSettingsResponse {
  return {
    countryId: setting.countryId,
    vatRateBps: setting.vatRateBps,
    vatRatePercent: setting.vatRateBps / 100,
    updatedAt: setting.updatedAt.toISOString(),
    updatedBy: setting.updatedBy,
  };
}

export class SetTaxSettingsCommandHandler implements ICommandHandler<SetTaxSettingsCommand, SetTaxSettingsResult> {
  constructor(
    private readonly countryLookup: ICountryLookup,
    private readonly repository: ITaxSettingsRepository,
    private readonly clock: IClock,
    private readonly logger: IInvoicingLogger,
  ) {}

  async handle(command: SetTaxSettingsCommand): Promise<SetTaxSettingsResult> {
    if (!(await this.countryLookup.getById(command.countryId))) return { outcome: 'country_not_found' };
    const created = TaxSetting.create({ countryId: command.countryId, vatRateBps: command.vatRateBps, updatedAt: this.clock.now(), updatedBy: command.adminUserId });
    if (!created.ok) return { outcome: 'invalid', fieldErrors: { vatRateBps: 'must be an integer between 0 and 10000' } };
    const previous = await this.repository.getByCountry(command.countryId);
    await this.repository.save(created.setting);
    this.logger.info(
      { outcome: 'tax_settings_saved', countryId: command.countryId, adminUserId: command.adminUserId, vatRateBps: command.vatRateBps, previousVatRateBps: previous?.vatRateBps ?? null },
      'VAT rate saved',
    );
    return { outcome: 'saved', settings: toTaxSettingsResponse(created.setting) };
  }
}
