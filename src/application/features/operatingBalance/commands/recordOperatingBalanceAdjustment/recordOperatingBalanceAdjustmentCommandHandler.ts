import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { operatingBalanceAdjustedMessage } from '../../../../../domain/notifications/depositMessages.js';
import { notifyOnce, type NotifyOnceDependencies } from '../../../bookingLifecycle/common/notifyOnce.js';
import {
  resolveGoalkeeperOperatingBalanceContext,
  type GoalkeeperOperatingBalanceContextDependencies,
} from '../../common/goalkeeperOperatingBalanceContext.js';
import type { IOperatingBalanceRepository } from '../../common/ports.js';
import type { OperatingBalanceLedger } from '../../common/operatingBalanceLedger.js';
import { toAdminMovementItem } from '../../common/operatingBalanceResponses.js';
import { RecordOperatingBalanceAdjustmentCommand, type RecordOperatingBalanceAdjustmentResult } from './recordOperatingBalanceAdjustmentCommand.js';

/**
 * Resolves whose operating balance and in which currency, then records the adjustment through the ledger and
 * tells the goalkeeper, once per movement, so the app shows the new balance right away.
 */
export class RecordOperatingBalanceAdjustmentCommandHandler
  implements ICommandHandler<RecordOperatingBalanceAdjustmentCommand, RecordOperatingBalanceAdjustmentResult>
{
  constructor(
    private readonly context: GoalkeeperOperatingBalanceContextDependencies,
    private readonly ledger: OperatingBalanceLedger,
    private readonly operatingBalanceRepository: IOperatingBalanceRepository,
    private readonly notices: NotifyOnceDependencies,
  ) {}

  async handle(command: RecordOperatingBalanceAdjustmentCommand): Promise<RecordOperatingBalanceAdjustmentResult> {
    const context = await resolveGoalkeeperOperatingBalanceContext(this.context, command.goalkeeperId);
    if (context.kind === 'not_a_goalkeeper') return { outcome: 'not_a_goalkeeper' };
    if (context.kind === 'operating_balance_not_configured') return { outcome: 'operating_balance_not_configured', marketId: context.marketId };

    const result = await this.ledger.adjust(
      { goalkeeperId: command.goalkeeperId, currency: context.currency, invoicing: context.invoicing, marketId: context.profile.marketId },
      { adminUserId: command.adminUserId, amount: command.amount, reason: command.reason, operationKey: command.operationKey },
    );
    switch (result.kind) {
      case 'recorded':
        await notifyOnce(this.notices, {
          userId: command.goalkeeperId,
          message: (language) => operatingBalanceAdjustedMessage(language, command.amount, command.reason, result.operatingBalance.balance, context.currency),
          dedupeKey: `operatingBalance-adjustment:${result.movement.id}`,
        });
        return { outcome: 'recorded', movement: toAdminMovementItem(result.movement), balance: result.operatingBalance.balance };
      case 'duplicate': {
        const operatingBalance = await this.operatingBalanceRepository.findByGoalkeeperId(command.goalkeeperId);
        return { outcome: 'replayed', movement: toAdminMovementItem(result.movement), balance: operatingBalance?.balance ?? 0 };
      }
      case 'insufficient_funds':
        return { outcome: 'insufficient_funds', balance: result.balance };
    }
  }
}
