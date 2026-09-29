import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IGoalkeeperProfileRepository } from '../../../goalkeepers/common/ports.js';
import { toDocumentItem } from '../../common/documentResponses.js';
import type { IInvoicingDocumentRepository } from '../../common/ports.js';
import { ListMyDocumentsQuery, type ListMyDocumentsResult } from './listMyDocumentsQuery.js';

export class ListMyDocumentsQueryHandler implements IQueryHandler<ListMyDocumentsQuery, ListMyDocumentsResult> {
  constructor(
    private readonly profiles: IGoalkeeperProfileRepository,
    private readonly documents: IInvoicingDocumentRepository,
  ) {}

  async handle(query: ListMyDocumentsQuery): Promise<ListMyDocumentsResult> {
    const { goalkeeperId, page, pageSize } = query;
    if (!(await this.profiles.getByUserId(goalkeeperId))) return { outcome: 'not_a_goalkeeper' };
    const [documents, totalItems] = await Promise.all([
      this.documents.listForGoalkeeper(goalkeeperId, (page - 1) * pageSize, pageSize),
      this.documents.countForGoalkeeper(goalkeeperId),
    ]);
    return { outcome: 'success', items: documents.map(toDocumentItem), page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) };
  }
}
