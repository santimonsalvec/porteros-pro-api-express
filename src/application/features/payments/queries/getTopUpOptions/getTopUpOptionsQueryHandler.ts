import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { ITermsAcceptanceRepository } from '../../../profile/common/ports.js';
import { resolveGoalkeeperWalletContext, type GoalkeeperWalletContextDependencies } from '../../../wallet/common/goalkeeperWalletContext.js';
import type { IPaymentGatewaySettingsRepository } from '../../common/ports.js';
import { acceptedCurrentTerms, usableSettings } from '../../common/topUpSetup.js';
import { GetTopUpOptionsQuery, type GetTopUpOptionsResult } from './getTopUpOptionsQuery.js';

export class GetTopUpOptionsQueryHandler implements IQueryHandler<GetTopUpOptionsQuery, GetTopUpOptionsResult> {
  constructor(
    private readonly context: GoalkeeperWalletContextDependencies,
    private readonly settingsRepository: IPaymentGatewaySettingsRepository,
    private readonly termsRepository: ITermsAcceptanceRepository,
    private readonly legal: { termsVersion: string },
  ) {}

  async handle(query: GetTopUpOptionsQuery): Promise<GetTopUpOptionsResult> {
    const context = await resolveGoalkeeperWalletContext(this.context, query.goalkeeperId);
    if (context.kind === 'not_a_goalkeeper') return { outcome: 'not_a_goalkeeper' };
    if (context.kind === 'wallet_not_configured') return { outcome: 'wallet_not_configured', cityId: context.cityId };

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
