import { ICommand } from '../../../../common/mediator/types.js';
import type { DeleteResult } from '../../common/deletion.js';

/** Deletes a city nothing points at; the reason goes to the audit log only. */
export class DeleteCityCommand extends ICommand<DeleteResult> {
  constructor(readonly cityId: string) {
    super();
  }
}
