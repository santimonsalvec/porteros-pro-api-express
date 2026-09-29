import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { TopUp } from '../../../../../domain/payments/topUp.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { ITermsAcceptanceRepository } from '../../../profile/common/ports.js';
import { resolveGoalkeeperWalletContext, type GoalkeeperWalletContextDependencies } from '../../../wallet/common/goalkeeperWalletContext.js';
import type {
  IPaymentGatewayRegistry,
  IPaymentGatewaySettingsRepository,
  IPaymentSecrets,
  IPaymentsLogger,
  ITopUpRepository,
} from '../../common/ports.js';
import { toTopUpResponse } from '../../common/topUpResponses.js';
import { acceptedCurrentTerms, usableSettings } from '../../common/topUpSetup.js';
import { StartTopUpCommand, type StartTopUpResult } from './startTopUpCommand.js';

export interface StartTopUpDependencies {
  context: GoalkeeperWalletContextDependencies;
  settingsRepository: IPaymentGatewaySettingsRepository;
  termsRepository: ITermsAcceptanceRepository;
  gateways: IPaymentGatewayRegistry;
  secrets: IPaymentSecrets;
  topUpRepository: ITopUpRepository;
  idGenerator: IIdGenerator;
  clock: IClock;
  logger: IPaymentsLogger;
  /** The current terms version and the API's public base address (for the gateway's return). */
  settings: { termsVersion: string; publicBaseUrl: string };
}

/**
 * Creates a pending top-up with the country's current gateway and answers the gateway's signed
 * checkout address (research.md §1). Nothing is credited here: only the gateway's confirmation or
 * the reconciliation credits. Secrets are used to sign and never leave this handler.
 */
export class StartTopUpCommandHandler implements ICommandHandler<StartTopUpCommand, StartTopUpResult> {
  constructor(private readonly deps: StartTopUpDependencies) {}

  async handle(command: StartTopUpCommand): Promise<StartTopUpResult> {
    const context = await resolveGoalkeeperWalletContext(this.deps.context, command.goalkeeperId);
    if (context.kind === 'not_a_goalkeeper') return { outcome: 'not_a_goalkeeper' };
    if (context.kind === 'wallet_not_configured') return { outcome: 'wallet_not_configured', cityId: context.cityId };

    const settings = await usableSettings(this.deps.settingsRepository, context.countryId, context.currency);
    if (!settings) return { outcome: 'top_ups_unavailable' };
    if (!settings.amounts.includes(command.amount)) return { outcome: 'invalid_amount', amounts: settings.amounts };
    if (!(await acceptedCurrentTerms(this.deps.termsRepository, command.goalkeeperId, this.deps.settings.termsVersion))) {
      return { outcome: 'terms_not_accepted', termsVersion: this.deps.settings.termsVersion };
    }

    const gateway = this.deps.gateways.get(settings.gateway);
    const country = await this.deps.context.countryLookup.getById(context.countryId);
    const secrets = country ? this.deps.secrets.forGateway(settings.gateway, country.countryCode) : null;
    const baseUrl = this.deps.settings.publicBaseUrl.replace(/\/+$/, '');
    if (!gateway || !secrets || baseUrl === '') {
      // Names what is missing, never a value.
      this.deps.logger.warn(
        { outcome: 'gateway_unavailable', gateway: settings.gateway, countryId: context.countryId, gatewaySupported: gateway !== null, secretsPresent: secrets !== null, publicBaseUrlSet: baseUrl !== '' },
        'Top-up refused: the gateway is not usable',
      );
      return { outcome: 'gateway_unavailable' };
    }

    const topUp = TopUp.start({
      id: this.deps.idGenerator.newId(),
      goalkeeperId: command.goalkeeperId,
      countryId: context.countryId,
      gateway: settings.gateway,
      environment: settings.publicConfig.environment,
      amount: command.amount,
      cost: settings.costFor(command.amount),
      currency: context.currency,
      now: this.deps.clock.now(),
    });
    const checkoutUrl = gateway.buildCheckout({
      reference: topUp.reference,
      amountInCents: topUp.amount * 100,
      currency: topUp.currency,
      redirectUrl: `${baseUrl}/pagos/retorno/${encodeURIComponent(topUp.reference)}`,
      publicKey: settings.publicConfig.publicKey,
      secrets,
    });
    await this.deps.topUpRepository.create(topUp);
    this.deps.logger.info(
      { outcome: 'top_up_started', topUpId: topUp.id, reference: topUp.reference, gateway: topUp.gateway, amount: topUp.amount },
      'Top-up started',
    );
    return { outcome: 'started', topUp: toTopUpResponse(topUp), checkoutUrl };
  }
}
