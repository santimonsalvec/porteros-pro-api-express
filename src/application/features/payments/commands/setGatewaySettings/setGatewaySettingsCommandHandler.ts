import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { PaymentGatewaySettings, type GatewayName } from '../../../../../domain/payments/gatewaySettings.js';
import type { IMarketRepository } from '../../../markets/common/ports.js';
import type { ICountryLookup } from '../../../goalkeeperRequests/common/ports.js';
import { gatewayCredentialsPresent, toGatewaySettingsResponse } from '../../common/gatewaySettingsResponse.js';
import type { IPaymentGatewaySettingsRepository, IPaymentSecrets, IPaymentsLogger } from '../../common/ports.js';
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
    private readonly secrets: IPaymentSecrets,
    private readonly clock: IClock,
    private readonly logger: IPaymentsLogger,
    private readonly markets: Pick<IMarketRepository, 'getById'>,
  ) {}

  async handle(command: SetGatewaySettingsCommand): Promise<SetGatewaySettingsResult> {
    const market = command.scope === 'market' ? await this.markets.getById(command.refId) : null;
    if (command.scope === 'market' && !market) return { outcome: 'market_not_found' };
    const country = await this.countryLookup.getById(market ? market.countryId : command.refId);
    if (!country) return { outcome: 'country_not_found' };
    if (!country.currency) return { outcome: 'invalid', fieldErrors: { currency: 'the country has no currency configured' } };

    const created = PaymentGatewaySettings.create({
      countryId: country.id,
      scope: command.scope,
      refId: command.refId,
      gateway: command.gateway as GatewayName,
      publicConfig: command.publicConfig,
      currency: country.currency,
      costs: command.costs,
      amounts: command.amounts,
      updatedAt: this.clock.now(),
      updatedBy: command.adminUserId,
    });
    if (!created.ok) return { outcome: 'invalid', fieldErrors: toFieldErrors(created.problems) };

    const previous = await this.settingsRepository.getFor(command.scope, command.refId);
    const written =
      command.revision === null ? await this.settingsRepository.create(created.settings) : await this.settingsRepository.update(created.settings, command.revision);
    if (written === 'stale') return { outcome: 'stale' };
    const saved = (await this.settingsRepository.getFor(command.scope, command.refId)) ?? created.settings;
    this.logger.info(
      {
        outcome: 'gateway_settings_saved',
        countryId: country.id,
        scope: command.scope,
        refId: command.refId,
        adminUserId: command.adminUserId,
        gateway: created.settings.gateway,
        environment: created.settings.publicConfig.environment,
        previousGateway: previous?.gateway ?? null,
      },
      'Payment gateway settings saved',
    );
    const credentialsPresent = await gatewayCredentialsPresent({ secrets: this.secrets, countryLookup: this.countryLookup }, saved);
    return { outcome: 'saved', settings: toGatewaySettingsResponse(saved, credentialsPresent) };
  }
}
