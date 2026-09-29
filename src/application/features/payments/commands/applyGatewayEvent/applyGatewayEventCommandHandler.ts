import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { ICountryLookup } from '../../../goalkeeperRequests/common/ports.js';
import { applyTopUpOutcome, finalStatusOf, type ApplyTopUpOutcomeDependencies } from '../../common/applyTopUpOutcome.js';
import type { IPaymentGatewayRegistry, IPaymentSecrets, ITopUpRepository } from '../../common/ports.js';
import { ApplyGatewayEventCommand, type ApplyGatewayEventResult } from './applyGatewayEventCommand.js';

export interface ApplyGatewayEventDependencies extends ApplyTopUpOutcomeDependencies {
  gateways: IPaymentGatewayRegistry;
  secrets: IPaymentSecrets;
  topUpRepository: ITopUpRepository;
  countryLookup: ICountryLookup;
  clock: IClock;
}

/**
 * The gateway's confirmation (research.md §2): the reference names the top-up, whose own gateway
 * and country give the secrets that verify the event. Only a genuine final status changes it.
 * Every failure but an internal one is answered as handled, since a retry could not succeed.
 */
export class ApplyGatewayEventCommandHandler implements ICommandHandler<ApplyGatewayEventCommand, ApplyGatewayEventResult> {
  constructor(private readonly deps: ApplyGatewayEventDependencies) {}

  async handle(command: ApplyGatewayEventCommand): Promise<ApplyGatewayEventResult> {
    try {
      return { outcome: await this.apply(command) };
    } catch (error) {
      this.deps.logger.warn(
        { outcome: 'top_up_event_error', gateway: command.gateway, error: error instanceof Error ? error.message : String(error) },
        'Top-up event failed; the gateway will retry it',
      );
      return { outcome: 'error' };
    }
  }

  private async apply(command: ApplyGatewayEventCommand): Promise<ApplyGatewayEventResult['outcome']> {
    const { logger } = this.deps;
    const gateway = this.deps.gateways.get(command.gateway);
    const parsed = gateway?.parseEvent(command.body) ?? null;
    if (!gateway || !parsed) {
      logger.warn({ outcome: 'top_up_event_ignored', gateway: command.gateway, reason: 'unreadable' }, 'Top-up event ignored');
      return 'ignored';
    }
    const topUp = await this.deps.topUpRepository.getByReference(parsed.reference);
    if (!topUp || topUp.gateway !== gateway.name) {
      logger.warn({ outcome: 'top_up_event_ignored', gateway: command.gateway, reference: parsed.reference, reason: 'unknown_reference' }, 'Top-up event ignored');
      return 'ignored';
    }

    const country = await this.deps.countryLookup.getById(topUp.countryId);
    const secrets = country ? this.deps.secrets.forGateway(topUp.gateway, country.countryCode) : null;
    if (!secrets) throw new Error(`Top-up ${topUp.id}: no ${topUp.gateway} secrets for its country`);
    const outcome = gateway.verifyEvent(command.body, command.headers, secrets);
    if (!outcome) {
      logger.warn({ outcome: 'top_up_event_rejected', reference: topUp.reference }, 'Top-up event rejected: invalid signature');
      return 'rejected';
    }
    const status = finalStatusOf(outcome.status);
    if (status === null) return 'ignored';

    const result = await applyTopUpOutcome(this.deps, topUp, status, outcome, this.deps.clock.now());
    switch (result.kind) {
      case 'applied':
        return 'applied';
      case 'unchanged':
        return 'unchanged';
      case 'mismatch':
        return 'mismatch';
      case 'not_found':
        return 'ignored';
    }
  }
}
