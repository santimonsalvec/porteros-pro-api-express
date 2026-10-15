import { IQuery } from '../../../../common/mediator/types.js';
import type { MyBackgroundCheckView } from '../../common/vettingViews.js';

export type ListMyBackgroundChecksResult = { outcome: 'ok'; items: MyBackgroundCheckView[] } | { outcome: 'not_a_goalkeeper' };

/** The goalkeeper's background checks, newest first (contracts A2). */
export class ListMyBackgroundChecksQuery extends IQuery<ListMyBackgroundChecksResult> {
  constructor(public readonly userId: string) {
    super();
  }
}
