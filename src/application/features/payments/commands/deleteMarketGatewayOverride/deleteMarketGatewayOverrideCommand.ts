import { ICommand } from '../../../../common/mediator/types.js';

export type DeleteMarketGatewayOverrideResult = { outcome: 'deleted' } | { outcome: 'not_found' };

/** A market goes back to its country's deposit settings (spec 031, contract E). */
export class DeleteMarketGatewayOverrideCommand extends ICommand<DeleteMarketGatewayOverrideResult> {
  constructor(public readonly marketId: string) {
    super();
  }
}
