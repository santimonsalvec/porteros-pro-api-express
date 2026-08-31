import { ICommand } from '../../../../common/mediator/types.js';
import type { PorteroRegistrationResponse } from '../../common/porteroRegistrationResponse.js';

export type SaveIdentificationSectionOutcome =
  | 'success'
  | 'validation_failed'
  | 'invalid_document_type'
  | 'duplicate_document'
  | 'already_active';

export interface SaveIdentificationSectionResult {
  outcome: SaveIdentificationSectionOutcome;
  registration?: PorteroRegistrationResponse;
  fieldErrors?: Record<string, string>;
}

export class SaveIdentificationSectionCommand extends ICommand<SaveIdentificationSectionResult> {
  constructor(
    public readonly userId: string,
    public readonly documentType?: string,
    public readonly documentNumber?: string,
    public readonly issueDate?: string,
    public readonly birthDate?: string,
  ) {
    super();
  }
}
