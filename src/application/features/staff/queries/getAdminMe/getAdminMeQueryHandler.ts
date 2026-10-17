import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IUserRepository } from '../../../auth/common/ports.js';
import type { IAdminSessionStore, IStaffMemberRepository, IStaffRoleRepository } from '../../common/ports.js';
import { toSessionSummary } from '../../common/sessionResponse.js';
import { GetAdminMeQuery, type GetAdminMeResult } from './getAdminMeQuery.js';

export interface GetAdminMeDependencies {
  members: IStaffMemberRepository;
  roles: IStaffRoleRepository;
  sessions: IAdminSessionStore;
  /** The linked user, for the account's language (feature 032). */
  users: Pick<IUserRepository, 'getById'>;
}

/** The signed-in member with the effective permission list (the whole catalog for an owner). */
export class GetAdminMeQueryHandler implements IQueryHandler<GetAdminMeQuery, GetAdminMeResult> {
  constructor(private readonly deps: GetAdminMeDependencies) {}

  async handle(query: GetAdminMeQuery): Promise<GetAdminMeResult> {
    const member = await this.deps.members.getById(query.staffId);
    const session = await this.deps.sessions.getById(query.sessionId);
    const role = member ? await this.deps.roles.getById(member.roleId) : null;
    if (!member?.userId || !session || !role) return { outcome: 'not_found' };
    const user = await this.deps.users.getById(member.userId);

    return {
      outcome: 'ok',
      me: {
        staffId: member.id,
        userId: member.userId,
        email: member.email,
        displayName: member.displayName,
        role: { id: role.id, name: role.name, system: role.system },
        permissions: role.effectivePermissions(),
        session: toSessionSummary(session),
        preferredLanguage: user?.preferredLanguage ?? null,
      },
    };
  }
}
