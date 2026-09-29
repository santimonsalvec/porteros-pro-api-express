import { IQuery } from '../../../../common/mediator/types.js';
import type { DocumentItemResponse } from '../../common/documentResponses.js';

export type ListMyDocumentsResult =
  | { outcome: 'success'; items: DocumentItemResponse[]; page: number; pageSize: number; totalItems: number; totalPages: number }
  | { outcome: 'not_a_goalkeeper' };

/** The goalkeeper's own invoices and credit notes, newest first (contracts §1). */
export class ListMyDocumentsQuery extends IQuery<ListMyDocumentsResult> {
  constructor(
    public readonly goalkeeperId: string,
    public readonly page: number,
    public readonly pageSize: number,
  ) {
    super();
  }
}
