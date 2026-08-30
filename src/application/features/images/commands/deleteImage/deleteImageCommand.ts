import { ICommand } from '../../../../common/mediator/types.js';

export type DeleteImageOutcome = 'success' | 'not_found' | 'forbidden';

export interface DeleteImageResult {
  outcome: DeleteImageOutcome;
}

export class DeleteImageCommand extends ICommand<DeleteImageResult> {
  constructor(
    public readonly userId: string,
    public readonly imageId: string,
  ) {
    super();
  }
}
