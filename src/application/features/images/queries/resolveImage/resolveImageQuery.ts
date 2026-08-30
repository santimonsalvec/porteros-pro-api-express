import { IQuery } from '../../../../common/mediator/types.js';
import type { StoredImageResponse } from '../../common/storedImageResponse.js';

export type ResolveImageOutcome = 'success' | 'not_found' | 'forbidden';

export interface ResolveImageResult {
  outcome: ResolveImageOutcome;
  image?: StoredImageResponse;
}

export class ResolveImageQuery extends IQuery<ResolveImageResult> {
  constructor(
    public readonly userId: string,
    public readonly imageId: string,
  ) {
    super();
  }
}
