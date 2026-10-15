import { ICommand } from '../../../../common/mediator/types.js';
import type { UnverifiedFields } from '../../common/ports.js';

export type UpdateUnverifiedDiscountResult =
  | { outcome: 'saved'; id: string }
  | { outcome: 'invalid'; fieldErrors: Record<string, string> }
  | { outcome: 'not_found' }
  | { outcome: 'stale' };

/** Changes a level's terms at the revision the administrator read (contracts D3). */
export class UpdateUnverifiedDiscountCommand extends ICommand<UpdateUnverifiedDiscountResult> {
  constructor(
    public readonly id: string,
    public readonly revision: number,
    public readonly fields: UnverifiedFields,
  ) {
    super();
  }
}
