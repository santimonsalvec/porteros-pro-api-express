import type { IClock } from '../../../../common/clock.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { offersStatus } from '../../../../../domain/operatingBalance/fundsPolicy.js';
import { OperatingBalance } from '../../../../../domain/operatingBalance/operatingBalance.js';
import {
  resolveGoalkeeperOperatingBalanceContext,
  type GoalkeeperOperatingBalanceContextDependencies,
} from '../../common/goalkeeperOperatingBalanceContext.js';
import type { ICommissionResolver, IVatRateResolver, IOperatingBalanceRepository } from '../../common/ports.js';
import { GetGoalkeeperOperatingBalanceQuery, type GetGoalkeeperOperatingBalanceResult } from './getGoalkeeperOperatingBalanceQuery.js';

/**
 * The operating balance as the goalkeeper needs it to understand what they see: the balance, and whether it
 * covers the lowest commission of the zones they have enabled right now (funds rule a).
 */
export class GetGoalkeeperOperatingBalanceQueryHandler implements IQueryHandler<GetGoalkeeperOperatingBalanceQuery, GetGoalkeeperOperatingBalanceResult> {
  constructor(
    private readonly context: GoalkeeperOperatingBalanceContextDependencies,
    private readonly operatingBalanceRepository: IOperatingBalanceRepository,
    private readonly commissionResolver: ICommissionResolver,
    private readonly clock: IClock,
    private readonly vatRates: IVatRateResolver,
  ) {}

  async handle(query: GetGoalkeeperOperatingBalanceQuery): Promise<GetGoalkeeperOperatingBalanceResult> {
    const context = await resolveGoalkeeperOperatingBalanceContext(this.context, query.goalkeeperId);
    if (context.kind === 'not_a_goalkeeper') return { outcome: 'not_a_goalkeeper' };
    if (context.kind === 'operating_balance_not_configured') return { outcome: 'operating_balance_not_configured', marketId: context.marketId };

    const [stored, commissions, vatRateBps] = await Promise.all([
      this.operatingBalanceRepository.findByGoalkeeperId(query.goalkeeperId),
      this.commissionResolver.resolveForZones(context.profile.zoneIds),
      this.vatRates.forCountry(context.countryId),
    ]);
    const operatingBalance = stored ?? OperatingBalance.empty(query.goalkeeperId, context.currency, this.clock.now());

    return {
      outcome: 'success',
      operatingBalance: {
        balance: operatingBalance.balance,
        currency: operatingBalance.currency,
        offers: offersStatus(operatingBalance.balance, [...commissions.values()], vatRateBps),
        movementCount: operatingBalance.lastSequence,
      },
      unconfiguredZoneIds: [...commissions].filter(([, commission]) => commission === null).map(([zoneId]) => zoneId),
    };
  }
}
