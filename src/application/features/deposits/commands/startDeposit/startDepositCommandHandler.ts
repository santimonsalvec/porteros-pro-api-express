import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { Deposit } from '../../../../../domain/deposits/deposit.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { ITermsAcceptanceRepository } from '../../../profile/common/ports.js';
import { resolveGoalkeeperOperatingBalanceContext, type GoalkeeperOperatingBalanceContextDependencies } from '../../../operatingBalance/common/goalkeeperOperatingBalanceContext.js';
import type {
  IPaymentGatewayRegistry,
  IPaymentGatewaySettingsRepository,
  IPaymentSecrets,
  IPaymentsLogger,
  IDepositRepository,
} from '../../../payments/common/ports.js';
import { toDepositResponse } from '../../common/depositResponses.js';
import { acceptedCurrentTerms, usableSettings } from '../../common/depositSetup.js';
import { StartDepositCommand, type StartDepositResult } from './startDepositCommand.js';

export interface StartDepositDependencies {
  context: GoalkeeperOperatingBalanceContextDependencies;
  settingsRepository: IPaymentGatewaySettingsRepository;
  termsRepository: ITermsAcceptanceRepository;
  gateways: IPaymentGatewayRegistry;
  secrets: IPaymentSecrets;
  depositRepository: IDepositRepository;
  idGenerator: IIdGenerator;
  clock: IClock;
  logger: IPaymentsLogger;
  /** The current terms version and the API's public base address (for the gateway's return). */
  settings: { termsVersion: string; publicBaseUrl: string };
}

/**
 * Creates a pending deposit with the country's current gateway and answers the gateway's signed
 * checkout address (research.md §1). Nothing is credited here: only the gateway's confirmation or
 * the reconciliation credits. Secrets are used to sign and never leave this handler.
 */
export class StartDepositCommandHandler implements ICommandHandler<StartDepositCommand, StartDepositResult> {
  constructor(private readonly deps: StartDepositDependencies) {}

  async handle(command: StartDepositCommand): Promise<StartDepositResult> {
    const context = await resolveGoalkeeperOperatingBalanceContext(this.deps.context, command.goalkeeperId);
    if (context.kind === 'not_a_goalkeeper') return { outcome: 'not_a_goalkeeper' };
    if (context.kind === 'operating_balance_not_configured') return { outcome: 'operating_balance_not_configured', cityId: context.cityId };

    const settings = await usableSettings(this.deps.settingsRepository, context.countryId, context.currency);
    if (!settings) return { outcome: 'deposits_unavailable' };
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
        'Deposit refused: the gateway is not usable',
      );
      return { outcome: 'gateway_unavailable' };
    }

    const deposit = Deposit.start({
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
      reference: deposit.reference,
      amountInCents: deposit.amount * 100,
      currency: deposit.currency,
      redirectUrl: `${baseUrl}/pagos/retorno/${encodeURIComponent(deposit.reference)}`,
      publicKey: settings.publicConfig.publicKey,
      secrets,
    });
    await this.deps.depositRepository.create(deposit);
    this.deps.logger.info(
      { outcome: 'deposit_started', depositId: deposit.id, reference: deposit.reference, gateway: deposit.gateway, amount: deposit.amount },
      'Deposit started',
    );
    return { outcome: 'started', deposit: toDepositResponse(deposit), checkoutUrl };
  }
}
