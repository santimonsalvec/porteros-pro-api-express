import { ICommand } from '../../../../common/mediator/types.js';

export interface MatchSurfaceFields {
  name: string;
  active: boolean;
  order: number;
}

export type SaveMatchSurfaceResult =
  | { outcome: 'saved'; surfaceId: string; created: boolean }
  | { outcome: 'not_found' }
  | { outcome: 'stale' }
  | { outcome: 'reason_required' };

/** Creates a playing surface, or edits one; deactivating needs a reason (admin spec 003, US5). */
export class SaveMatchSurfaceCommand extends ICommand<SaveMatchSurfaceResult> {
  /** Use `create` or `edit`. */
  constructor(
    readonly surfaceId: string | null,
    readonly revision: number,
    readonly fields: Partial<MatchSurfaceFields>,
    readonly reason: string | null,
  ) {
    super();
  }

  static create(fields: MatchSurfaceFields): SaveMatchSurfaceCommand {
    return new SaveMatchSurfaceCommand(null, 0, fields, null);
  }

  static edit(surfaceId: string, revision: number, changes: Partial<MatchSurfaceFields>, reason: string | null = null): SaveMatchSurfaceCommand {
    return new SaveMatchSurfaceCommand(surfaceId, revision, changes, reason);
  }
}
