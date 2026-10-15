import { ICommand } from '../../../../common/mediator/types.js';
import type { MyBackgroundCheckView } from '../../common/vettingViews.js';

export type UploadBackgroundCheckResult =
  | { outcome: 'created'; check: MyBackgroundCheckView }
  | { outcome: 'not_a_goalkeeper' }
  /** Already 5 pending or valid checks (research §3). */
  | { outcome: 'limit_reached' }
  | { outcome: 'storage_unavailable' };

/** The goalkeeper uploads a criminal background certificate for the team to review (admin spec 030). */
export class UploadBackgroundCheckCommand extends ICommand<UploadBackgroundCheckResult> {
  constructor(
    public readonly userId: string,
    public readonly buffer: Buffer,
    public readonly contentType: string,
  ) {
    super();
  }
}
