import { ICommand } from '../../../../common/mediator/types.js';
import type { StaffActor } from '../../../../../domain/staff/staffActor.js';
import type { StaffScope } from '../../../../../domain/staff/staffScope.js';

export type ChangeStaffMemberScopesResult =
  | { outcome: 'changed' | 'unchanged' }
  | { outcome: 'staff_not_found' | 'scopes_required' | 'scope_not_found' | 'owner_requires_owner' };

/** Where a member may work from now on (spec 031, contract F); the reason goes to the audit log. */
export class ChangeStaffMemberScopesCommand extends ICommand<ChangeStaffMemberScopesResult> {
  constructor(
    readonly staffId: string,
    readonly scopes: readonly StaffScope[],
    readonly actor: StaffActor,
  ) {
    super();
  }
}
