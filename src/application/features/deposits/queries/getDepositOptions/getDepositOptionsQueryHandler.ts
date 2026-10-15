import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { ITermsAcceptanceRepository } from '../../../profile/common/ports.js';
import { resolveGoalkeeperOperatingBalanceContext, type GoalkeeperOperatingBalanceContextDependencies } from '../../../operatingBalance/common/goalkeeperOperatingBalanceContext.js';
import type { IPaymentGatewaySettingsRepository } from '../../../payments/common/ports.js';
import { acceptedCurrentTerms, usableSettings } from '../../common/depositSetup.js';
import { GetDepositOptionsQuery, type GetDepositOptionsResult } from './getDepositOptionsQuery.js';

export class GetDepositOptionsQueryHandler implements IQueryHandler<GetDepositOptionsQuery, GetDepositOptionsResult> {
  constructor(
    private readonly context: GoalkeeperOperatingBalanceContextDependencies,
    private readonly settingsRepository: IPaymentGatewaySettingsRepository,
    private readonly termsRepository: ITermsAcceptanceRepository,
    private readonly legal: { termsVersion: string },
  ) {}

  async handle(query: GetDepositOptionsQuery): Promise<GetDepositOptionsResult> {
    const context = await resolveGoalkeeperOperatingBalanceContext(this.context, query.goalkeeperId);
    if (context.kind === 'not_a_goalkeeper') return { outcome: 'not_a_goalkeeper' };
    if (context.kind === 'operating_balance_not_configured') return { outcome: 'operating_balance_not_configured', cityId: context.cityId };

    const [settings, termsAccepted] = await Promise.all([
      usableSettings(this.settingsRepository, context.countryId, context.currency),
      acceptedCurrentTerms(this.termsRepository, query.goalkeeperId, this.legal.termsVersion),
    ]);
    return {
      outcome: 'ok',
      available: settings !== null,
      gateway: settings?.gateway ?? null,
      currency: context.currency,
      termsAccepted,
      termsVersion: this.legal.termsVersion,
      options: settings?.options() ?? [],
    };
  }
}
