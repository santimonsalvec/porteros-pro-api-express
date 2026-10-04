import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { walletAdjustedMessage } from '../../../../../domain/notifications/topUpMessages.js';
import { notifyOnce, type NotifyOnceDependencies } from '../../../bookingLifecycle/common/notifyOnce.js';
import {
  resolveGoalkeeperWalletContext,
  type GoalkeeperWalletContextDependencies,
} from '../../common/goalkeeperWalletContext.js';
import type { IWalletRepository } from '../../common/ports.js';
import type { WalletLedger } from '../../common/walletLedger.js';
import { toAdminMovementItem } from '../../common/walletResponses.js';
import { RecordWalletAdjustmentCommand, type RecordWalletAdjustmentResult } from './recordWalletAdjustmentCommand.js';

/**
 * Resolves whose wallet and in which currency, then records the adjustment through the ledger and
 * tells the goalkeeper, once per movement, so the app shows the new balance right away.
 */
export class RecordWalletAdjustmentCommandHandler
  implements ICommandHandler<RecordWalletAdjustmentCommand, RecordWalletAdjustmentResult>
{
  constructor(
    private readonly context: GoalkeeperWalletContextDependencies,
    private readonly ledger: WalletLedger,
    private readonly walletRepository: IWalletRepository,
    private readonly notices: NotifyOnceDependencies,
  ) {}

  async handle(command: RecordWalletAdjustmentCommand): Promise<RecordWalletAdjustmentResult> {
    const context = await resolveGoalkeeperWalletContext(this.context, command.goalkeeperId);
    if (context.kind === 'not_a_goalkeeper') return { outcome: 'not_a_goalkeeper' };
    if (context.kind === 'wallet_not_configured') return { outcome: 'wallet_not_configured', cityId: context.cityId };

    const result = await this.ledger.adjust(
      { goalkeeperId: command.goalkeeperId, currency: context.currency, invoicing: context.invoicing },
      { adminUserId: command.adminUserId, amount: command.amount, reason: command.reason, operationKey: command.operationKey },
    );
    switch (result.kind) {
      case 'recorded':
        await notifyOnce(this.notices, {
          userId: command.goalkeeperId,
          message: walletAdjustedMessage(command.amount, command.reason, result.wallet.balance, context.currency),
          dedupeKey: `wallet-adjustment:${result.movement.id}`,
        });
        return { outcome: 'recorded', movement: toAdminMovementItem(result.movement), balance: result.wallet.balance };
      case 'duplicate': {
        const wallet = await this.walletRepository.findByGoalkeeperId(command.goalkeeperId);
        return { outcome: 'replayed', movement: toAdminMovementItem(result.movement), balance: wallet?.balance ?? 0 };
      }
      case 'insufficient_funds':
        return { outcome: 'insufficient_funds', balance: result.balance };
    }
  }
}
