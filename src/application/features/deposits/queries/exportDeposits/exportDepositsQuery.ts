import { IQuery } from '../../../../common/mediator/types.js';
import type { DepositAdminFilter } from '../../../payments/common/adminPorts.js';

export type ExportDepositsResult = { outcome: 'ok'; csv: string; rows: number } | { outcome: 'too_large'; count: number; limit: number };

/** Every deposit of the admin's filters as a CSV for accounting (admin spec 007, FR-024). */
export class ExportDepositsQuery extends IQuery<ExportDepositsResult> {
  constructor(public readonly filter: DepositAdminFilter) {
    super();
  }
}
