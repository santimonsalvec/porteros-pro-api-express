import { ICommand } from '../../../../common/mediator/types.js';
import type { GoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';

export type SaveDocumentPhotoOutcome = 'success' | 'storage_unavailable' | 'already_active';

export interface SaveDocumentPhotoResult {
  outcome: SaveDocumentPhotoOutcome;
  registration?: GoalkeeperRegistrationResponse;
}

export class SaveDocumentPhotoCommand extends ICommand<SaveDocumentPhotoResult> {
  constructor(
    public readonly userId: string,
    public readonly side: 'A' | 'B',
    public readonly buffer: Buffer,
    public readonly contentType: string,
  ) {
    super();
  }
}
