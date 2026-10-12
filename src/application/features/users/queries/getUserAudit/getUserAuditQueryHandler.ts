import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IUserRepository } from '../../../auth/common/ports.js';
import { userAuditView, type UserAuditView } from '../../common/userAuditViews.js';
import { GetUserAuditQuery } from './getUserAuditQuery.js';

export class GetUserAuditQueryHandler implements IQueryHandler<GetUserAuditQuery, UserAuditView | null> {
  constructor(private readonly deps: { users: Pick<IUserRepository, 'getById'> }) {}

  async handle({ userId }: GetUserAuditQuery): Promise<UserAuditView | null> {
    const user = await this.deps.users.getById(userId);
    return user ? userAuditView(user) : null;
  }
}
