import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { canReconcile } from '../../../../../domain/deposits/deposit.js';
import { checkDepositWithGateway, type CheckDepositDependencies } from '../../common/checkDeposit.js';
import { GatewayUnavailableError } from '../../../payments/common/ports.js';
import { ReconcileDepositCommand, type ReconcileDepositResult } from './reconcileDepositCommand.js';

export interface ReconcileDepositDependencies extends CheckDepositDependencies {
  clock: IClock;
}

/**
 * "Conciliar ahora" (admin spec 007, research §2): the sweep's ask for one deposit, by a member. It
 * never moves the sweep's schedule; the deposit store credits an approval at most once, whoever
 * applies it first (the webhook, the sweep or this).
 */
export class ReconcileDepositCommandHandler implements ICommandHandler<ReconcileDepositCommand, ReconcileDepositResult> {
  constructor(private readonly deps: ReconcileDepositDependencies) {}

  async handle(command: ReconcileDepositCommand): Promise<ReconcileDepositResult> {
    const result = await this.reconcile(command);
    this.deps.logger.info(
      {
        outcome: 'deposit_reconcile_requested',
        depositId: command.depositId,
        staffUserId: command.staffUserId,
        result: result.outcome,
        ...('answer' in result ? { answer: result.answer } : {}),
      },
      'Deposit reconciliation requested by an administrator',
    );
    return result;
  }

  private async reconcile(command: ReconcileDepositCommand): Promise<ReconcileDepositResult> {
    const deposit = await this.deps.depositRepository.getById(command.depositId);
    if (!deposit) return { outcome: 'not_found' };
    if (!canReconcile(deposit.status)) return { outcome: 'already_final', deposit };

    const country = await this.deps.countryLookup.getById(deposit.countryId);
    const secrets = country ? this.deps.secrets.forGateway(deposit.gateway, country.countryCode) : null;
    if (!this.deps.gateways.get(deposit.gateway) || !secrets) return { outcome: 'credentials_missing' };

    try {
      const checked = await checkDepositWithGateway(this.deps, deposit, this.deps.clock.now(), { by: 'staff', staffUserId: command.staffUserId });
      if (checked.kind === 'busy') return { outcome: 'in_progress' };
      const after = (await this.deps.depositRepository.getById(deposit.id)) ?? deposit;
      return { outcome: 'reconciled', answer: checked.answer, status: after.status, deposit: after };
    } catch (error) {
      if (!(error instanceof GatewayUnavailableError)) throw error;
      return { outcome: 'gateway_unavailable', deposit: (await this.deps.depositRepository.getById(deposit.id)) ?? deposit };
    }
  }
}
