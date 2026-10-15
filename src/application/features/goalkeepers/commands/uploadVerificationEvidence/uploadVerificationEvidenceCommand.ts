import { ICommand } from '../../../../common/mediator/types.js';

export type UploadVerificationEvidenceResult =
  | { outcome: 'created'; imageId: string; url: string }
  | { outcome: 'not_a_goalkeeper' }
  | { outcome: 'storage_unavailable' };

/** An administrator uploads a screenshot proving the goalkeeper works on another platform (contracts C8). */
export class UploadVerificationEvidenceCommand extends ICommand<UploadVerificationEvidenceResult> {
  constructor(
    public readonly staffUserId: string,
    public readonly goalkeeperId: string,
    public readonly buffer: Buffer,
    public readonly contentType: string,
  ) {
    super();
  }
}
