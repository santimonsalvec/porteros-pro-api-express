import { IQuery } from '../../../../common/mediator/types.js';
import type { ProviderFile } from '../../common/ports.js';

export type GetDocumentFileResult =
  | { outcome: 'success'; file: ProviderFile }
  | { outcome: 'not_found' }
  | { outcome: 'not_issued'; status: string }
  | { outcome: 'file_not_available' }
  | { outcome: 'provider_unavailable' };

/** The PDF or XML of one of the goalkeeper's issued documents, read from its provider (research.md §8). */
export class GetDocumentFileQuery extends IQuery<GetDocumentFileResult> {
  constructor(
    public readonly goalkeeperId: string,
    public readonly documentId: string,
    public readonly kind: 'pdf' | 'xml',
  ) {
    super();
  }
}
