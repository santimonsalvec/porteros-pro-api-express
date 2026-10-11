import { ICommand } from '../../../../common/mediator/types.js';
import type { DeleteResult } from '../../common/deletion.js';

/** Deletes a region nothing points at; the reason goes to the audit log only. */
export class DeleteRegionCommand extends ICommand<DeleteResult> {
  constructor(readonly regionId: string) {
    super();
  }
}
