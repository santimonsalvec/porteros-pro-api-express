import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IPaymentGatewaySettingsRepository } from '../../common/ports.js';
import { DeleteMarketGatewayOverrideCommand, type DeleteMarketGatewayOverrideResult } from './deleteMarketGatewayOverrideCommand.js';

export class DeleteMarketGatewayOverrideCommandHandler implements ICommandHandler<DeleteMarketGatewayOverrideCommand, DeleteMarketGatewayOverrideResult> {
  constructor(private readonly settingsRepository: IPaymentGatewaySettingsRepository) {}

  async handle({ marketId }: DeleteMarketGatewayOverrideCommand): Promise<DeleteMarketGatewayOverrideResult> {
    return { outcome: await this.settingsRepository.deleteMarketOverride(marketId) };
  }
}
