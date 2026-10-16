import { ICommand } from '../../../../common/mediator/types.js';
import type { ReadinessItem } from '../../../geography/common/readiness.js';

export type EnableMarketResult =
  | { outcome: 'enabled' }
  | { outcome: 'not_found' }
  | { outcome: 'stale' }
  | { outcome: 'already_enabled' }
  /** The checklist items still missing. */
  | { outcome: 'not_ready'; items: ReadinessItem[] };

/** Opens a draft or disabled market to clients and goalkeepers, only with its checklist complete (spec 031, FR-008). */
export class EnableMarketCommand extends ICommand<EnableMarketResult> {
  constructor(
    readonly marketId: string,
    readonly revision: number,
    readonly enabledBy: string,
  ) {
    super();
  }
}
