import { IQuery } from '../../../../common/mediator/types.js';
import type { TopUpAdminFilter } from '../../common/adminPorts.js';

export type ExportTopUpsResult = { outcome: 'ok'; csv: string; rows: number } | { outcome: 'too_large'; count: number; limit: number };

/** Every top-up of the admin's filters as a CSV for accounting (admin spec 007, FR-024). */
export class ExportTopUpsQuery extends IQuery<ExportTopUpsResult> {
  constructor(public readonly filter: TopUpAdminFilter) {
    super();
  }
}
