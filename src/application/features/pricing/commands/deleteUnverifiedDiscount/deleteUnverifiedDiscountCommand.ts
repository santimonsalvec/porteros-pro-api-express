import { ICommand } from '../../../../common/mediator/types.js';

export type DeleteUnverifiedDiscountResult = { outcome: 'deleted' } | { outcome: 'stale' } | { outcome: 'not_found' };

/** Removes a level's discount: it inherits the one above again (contracts D4). */
export class DeleteUnverifiedDiscountCommand extends ICommand<DeleteUnverifiedDiscountResult> {
  constructor(
    public readonly id: string,
    public readonly revision: number,
  ) {
    super();
  }
}
