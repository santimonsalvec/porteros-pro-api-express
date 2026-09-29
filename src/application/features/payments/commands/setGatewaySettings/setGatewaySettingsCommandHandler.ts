import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { PaymentGatewaySettings, type GatewayName } from '../../../../../domain/payments/gatewaySettings.js';
import type { ICountryLookup } from '../../../goalkeeperRequests/common/ports.js';
import { toGatewaySettingsResponse } from '../../common/gatewaySettingsResponse.js';
import type { IPaymentGatewaySettingsRepository, IPaymentsLogger } from '../../common/ports.js';
import { SetGatewaySettingsCommand, type SetGatewaySettingsResult } from './setGatewaySettingsCommand.js';

/** "amounts: values must be distinct" → { amounts: 'values must be distinct' }. */
function toFieldErrors(problems: string[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const problem of problems) {
    const separator = problem.indexOf(': ');
    const field = separator > 0 ? problem.slice(0, separator) : 'settings';
    errors[field] ??= separator > 0 ? problem.slice(separator + 2) : problem;
  }
  return errors;
}

export class SetGatewaySettingsCommandHandler implements ICommandHandler<SetGatewaySettingsCommand, SetGatewaySettingsResult> {
  constructor(
    private readonly countryLookup: ICountryLookup,
    private readonly settingsRepository: IPaymentGatewaySettingsRepository,
    private readonly clock: IClock,
    private readonly logger: IPaymentsLogger,
  ) {}

  async handle(command: SetGatewaySettingsCommand): Promise<SetGatewaySettingsResult> {
    const country = await this.countryLookup.getById(command.countryId);
    if (!country) return { outcome: 'country_not_found' };
    if (!country.currency) return { outcome: 'invalid', fieldErrors: { currency: 'the country has no currency configured' } };

    const created = PaymentGatewaySettings.create({
      countryId: country.id,
      gateway: command.gateway as GatewayName,
      publicConfig: command.publicConfig,
      currency: country.currency,
      costs: command.costs,
      amounts: command.amounts,
      updatedAt: this.clock.now(),
      updatedBy: command.adminUserId,
    });
    if (!created.ok) return { outcome: 'invalid', fieldErrors: toFieldErrors(created.problems) };

    const previous = await this.settingsRepository.getByCountry(country.id);
    await this.settingsRepository.save(created.settings);
    this.logger.info(
      {
        outcome: 'gateway_settings_saved',
        countryId: country.id,
        adminUserId: command.adminUserId,
        gateway: created.settings.gateway,
        environment: created.settings.publicConfig.environment,
        previousGateway: previous?.gateway ?? null,
      },
      'Payment gateway settings saved',
    );
    return { outcome: 'saved', settings: toGatewaySettingsResponse(created.settings) };
  }
}
