import type { IClock } from '../../../../common/clock.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { offersStatus } from '../../../../../domain/wallet/fundsPolicy.js';
import { Wallet } from '../../../../../domain/wallet/wallet.js';
import {
  resolveGoalkeeperWalletContext,
  type GoalkeeperWalletContextDependencies,
} from '../../common/goalkeeperWalletContext.js';
import type { ICommissionResolver, IVatRateResolver, IWalletRepository } from '../../common/ports.js';
import { GetGoalkeeperWalletQuery, type GetGoalkeeperWalletResult } from './getGoalkeeperWalletQuery.js';

/**
 * The wallet as the goalkeeper needs it to understand what they see: the balance, and whether it
 * covers the lowest commission of the zones they have enabled right now (funds rule a).
 */
export class GetGoalkeeperWalletQueryHandler implements IQueryHandler<GetGoalkeeperWalletQuery, GetGoalkeeperWalletResult> {
  constructor(
    private readonly context: GoalkeeperWalletContextDependencies,
    private readonly walletRepository: IWalletRepository,
    private readonly commissionResolver: ICommissionResolver,
    private readonly clock: IClock,
    private readonly vatRates: IVatRateResolver,
  ) {}

  async handle(query: GetGoalkeeperWalletQuery): Promise<GetGoalkeeperWalletResult> {
    const context = await resolveGoalkeeperWalletContext(this.context, query.goalkeeperId);
    if (context.kind === 'not_a_goalkeeper') return { outcome: 'not_a_goalkeeper' };
    if (context.kind === 'wallet_not_configured') return { outcome: 'wallet_not_configured', cityId: context.cityId };

    const [stored, commissions, vatRateBps] = await Promise.all([
      this.walletRepository.findByGoalkeeperId(query.goalkeeperId),
      this.commissionResolver.resolveForZones(context.profile.zoneIds),
      this.vatRates.forCountry(context.countryId),
    ]);
    const wallet = stored ?? Wallet.empty(query.goalkeeperId, context.currency, this.clock.now());

    return {
      outcome: 'success',
      wallet: {
        balance: wallet.balance,
        currency: wallet.currency,
        offers: offersStatus(wallet.balance, [...commissions.values()], vatRateBps),
        movementCount: wallet.lastSequence,
      },
      unconfiguredZoneIds: [...commissions].filter(([, commission]) => commission === null).map(([zoneId]) => zoneId),
    };
  }
}
