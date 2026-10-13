import { IQuery } from '../../../../common/mediator/types.js';
import type { ProviderFile } from '../../common/ports.js';

export type GetDocumentFileResult =
  | { outcome: 'success'; file: ProviderFile }
  | { outcome: 'not_found' }
  | { outcome: 'not_issued'; status: string }
  | { outcome: 'file_not_available' }
  | { outcome: 'provider_unavailable' };

/**
 * The PDF or XML of an issued document, read from its provider (research.md §8): the goalkeeper's own,
 * or any for an administrator (`goalkeeperId` null, admin spec 007).
 */
export class GetDocumentFileQuery extends IQuery<GetDocumentFileResult> {
  constructor(
    public readonly goalkeeperId: string | null,
    public readonly documentId: string,
    public readonly kind: 'pdf' | 'xml',
  ) {
    super();
  }
}
