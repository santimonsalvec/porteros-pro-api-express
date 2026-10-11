import { ICommand } from '../../../../common/mediator/types.js';
import type { DeleteResult } from '../../common/deletion.js';

/** Deletes a surface no request uses; one in use is deactivated instead. */
export class DeleteMatchSurfaceCommand extends ICommand<DeleteResult> {
  constructor(readonly surfaceId: string) {
    super();
  }
}
