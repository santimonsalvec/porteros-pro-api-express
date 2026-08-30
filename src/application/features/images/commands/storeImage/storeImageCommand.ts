import { ICommand } from '../../../../common/mediator/types.js';
import type { StoredImageResponse } from '../../common/storedImageResponse.js';

export type StoreImageOutcome = 'success' | 'storage_unavailable';

export interface StoreImageResult {
  outcome: StoreImageOutcome;
  image?: StoredImageResponse;
}

export class StoreImageCommand extends ICommand<StoreImageResult> {
  constructor(
    public readonly userId: string,
    public readonly buffer: Buffer,
    public readonly contentType: string,
  ) {
    super();
  }
}
