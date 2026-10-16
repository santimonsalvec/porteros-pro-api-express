import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { canManageMember } from '../../../../../domain/staff/teamRules.js';
import type { IStaffAccessResolver, IStaffMemberRepository } from '../../common/ports.js';
import { scopesRefusal } from '../../common/scopeChecks.js';
import type { ScopePlaces } from '../../common/staffViews.js';
import { ChangeStaffMemberScopesCommand, type ChangeStaffMemberScopesResult } from './changeStaffMemberScopesCommand.js';

export interface ChangeStaffMemberScopesDependencies {
  members: IStaffMemberRepository;
  clock: IClock;
  accessResolver: IStaffAccessResolver;
  places?: ScopePlaces;
}

/**
 * Only an owner changes an owner's scopes (as with roles). The member works with the new scopes now
 * in this process and within the access cache elsewhere (research §14).
 */
export class ChangeStaffMemberScopesCommandHandler implements ICommandHandler<ChangeStaffMemberScopesCommand, ChangeStaffMemberScopesResult> {
  constructor(private readonly deps: ChangeStaffMemberScopesDependencies) {}

  async handle(command: ChangeStaffMemberScopesCommand): Promise<ChangeStaffMemberScopesResult> {
    const member = await this.deps.members.getById(command.staffId);
    if (!member) return { outcome: 'staff_not_found' };
    if (!canManageMember(command.actor, member)) return { outcome: 'owner_requires_owner' };
    const refusal = await scopesRefusal(command.scopes, this.deps.places);
    if (refusal) return { outcome: refusal };

    const key = (scopes: readonly { kind: string; id?: string }[]) => JSON.stringify(scopes.map((scope) => [scope.kind, scope.id ?? null]).sort());
    if (key(member.scopes) === key(command.scopes)) return { outcome: 'unchanged' };
    await this.deps.members.update(member.changeScopes(command.scopes, this.deps.clock.now()));
    this.deps.accessResolver.invalidate();
    return { outcome: 'changed' };
  }
}
