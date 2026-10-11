import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import { normalizeStaffEmail, StaffMember } from '../../../../../domain/staff/staffMember.js';
import { OWNER_ROLE_ID } from '../../../../../domain/staff/staffRole.js';
import type { IStaffMemberRepository, IStaffRoleRepository } from '../../common/ports.js';
import { SeedOwnerCommand, type SeedOwnerResult } from './seedOwnerCommand.js';

export const SCRIPT_ACTOR = 'system:script';

export interface SeedOwnerDependencies {
  members: IStaffMemberRepository;
  roles: IStaffRoleRepository;
  ids: IIdGenerator;
  clock: IClock;
}

/**
 * Makes an email an owner, idempotently: a new owner invitation, the role changed to owner for an
 * existing member, or nothing when it already is one. The invitation activates on the first
 * Google sign-in with that email.
 */
export class SeedOwnerCommandHandler implements ICommandHandler<SeedOwnerCommand, SeedOwnerResult> {
  constructor(private readonly deps: SeedOwnerDependencies) {}

  async handle(command: SeedOwnerCommand): Promise<SeedOwnerResult> {
    const email = normalizeStaffEmail(command.email);
    if (!email) return { outcome: 'invalid_email' };
    const now = this.deps.clock.now();
    await this.deps.roles.ensureOwner(now);

    const existing = await this.deps.members.findByEmail(email);
    if (!existing) {
      const member = StaffMember.invite({ id: this.deps.ids.newId(), email, roleId: OWNER_ROLE_ID, invitedBy: SCRIPT_ACTOR }, now);
      await this.deps.members.add(member);
      return { outcome: 'created', staffId: member.id };
    }
    if (existing.roleId === OWNER_ROLE_ID) return { outcome: 'unchanged', staffId: existing.id };
    await this.deps.members.update(existing.changeRole(OWNER_ROLE_ID, now));
    return { outcome: 'promoted', staffId: existing.id };
  }
}
