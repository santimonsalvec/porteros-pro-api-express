import { IQuery } from '../../../../common/mediator/types.js';
import type { DocumentAdminFilter } from '../../common/adminPorts.js';

export type ExportDocumentsResult = { outcome: 'ok'; csv: string; rows: number } | { outcome: 'too_large'; count: number; limit: number };

/** Every document of the admin's filters as a CSV for accounting (admin spec 007, FR-024). */
export class ExportDocumentsQuery extends IQuery<ExportDocumentsResult> {
  constructor(public readonly filter: DocumentAdminFilter) {
    super();
  }
}
