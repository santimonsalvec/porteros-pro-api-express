import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { canReconcile } from '../../../../../domain/payments/topUp.js';
import { checkTopUpWithGateway, type CheckTopUpDependencies } from '../../common/checkTopUp.js';
import { GatewayUnavailableError } from '../../common/ports.js';
import { ReconcileTopUpCommand, type ReconcileTopUpResult } from './reconcileTopUpCommand.js';

export interface ReconcileTopUpDependencies extends CheckTopUpDependencies {
  clock: IClock;
}

/**
 * "Conciliar ahora" (admin spec 007, research §2): the sweep's ask for one top-up, by a member. It
 * never moves the sweep's schedule; the top-up store credits an approval at most once, whoever
 * applies it first (the webhook, the sweep or this).
 */
export class ReconcileTopUpCommandHandler implements ICommandHandler<ReconcileTopUpCommand, ReconcileTopUpResult> {
  constructor(private readonly deps: ReconcileTopUpDependencies) {}

  async handle(command: ReconcileTopUpCommand): Promise<ReconcileTopUpResult> {
    const result = await this.reconcile(command);
    this.deps.logger.info(
      {
        outcome: 'top_up_reconcile_requested',
        topUpId: command.topUpId,
        staffUserId: command.staffUserId,
        result: result.outcome,
        ...('answer' in result ? { answer: result.answer } : {}),
      },
      'Top-up reconciliation requested by an administrator',
    );
    return result;
  }

  private async reconcile(command: ReconcileTopUpCommand): Promise<ReconcileTopUpResult> {
    const topUp = await this.deps.topUpRepository.getById(command.topUpId);
    if (!topUp) return { outcome: 'not_found' };
    if (!canReconcile(topUp.status)) return { outcome: 'already_final', topUp };

    const country = await this.deps.countryLookup.getById(topUp.countryId);
    const secrets = country ? this.deps.secrets.forGateway(topUp.gateway, country.countryCode) : null;
    if (!this.deps.gateways.get(topUp.gateway) || !secrets) return { outcome: 'credentials_missing' };

    try {
      const checked = await checkTopUpWithGateway(this.deps, topUp, this.deps.clock.now(), { by: 'staff', staffUserId: command.staffUserId });
      if (checked.kind === 'busy') return { outcome: 'in_progress' };
      const after = (await this.deps.topUpRepository.getById(topUp.id)) ?? topUp;
      return { outcome: 'reconciled', answer: checked.answer, status: after.status, topUp: after };
    } catch (error) {
      if (!(error instanceof GatewayUnavailableError)) throw error;
      return { outcome: 'gateway_unavailable', topUp: (await this.deps.topUpRepository.getById(topUp.id)) ?? topUp };
    }
  }
}
