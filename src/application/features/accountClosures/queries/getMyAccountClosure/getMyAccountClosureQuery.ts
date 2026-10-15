import { IQuery } from '../../../../common/mediator/types.js';
import type { ClosurePreviewView, MyClosureView } from '../../common/closureViews.js';

export type GetMyAccountClosureResult = { outcome: 'ok'; current: MyClosureView | null; preview: ClosurePreviewView | null };

/** The user's open closure request, or what a new one would look like (feature 029). */
export class GetMyAccountClosureQuery extends IQuery<GetMyAccountClosureResult> {
  constructor(readonly userId: string) {
    super();
  }
}
