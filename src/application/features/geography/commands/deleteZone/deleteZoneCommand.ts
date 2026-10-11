import { ICommand } from '../../../../common/mediator/types.js';
import type { DeleteResult } from '../../common/deletion.js';

/** Deletes a zone nothing points at; one in use is deactivated instead. */
export class DeleteZoneCommand extends ICommand<DeleteResult> {
  constructor(readonly zoneId: string) {
    super();
  }
}
