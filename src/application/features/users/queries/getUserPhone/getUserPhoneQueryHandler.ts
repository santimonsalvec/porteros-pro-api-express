import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { UsersQueryDependencies } from '../../common/usersQueryDependencies.js';
import { GetUserPhoneQuery, type GetUserPhoneResult } from './getUserPhoneQuery.js';

export class GetUserPhoneQueryHandler implements IQueryHandler<GetUserPhoneQuery, GetUserPhoneResult> {
  constructor(private readonly deps: Pick<UsersQueryDependencies, 'users'>) {}

  async handle({ userId }: GetUserPhoneQuery): Promise<GetUserPhoneResult> {
    const user = await this.deps.users.getById(userId);
    if (!user) return { outcome: 'not_found' };
    if (!user.countryCallingCode || !user.whatsAppNumber) return { outcome: 'phone_not_set' };
    return { outcome: 'ok', phone: { countryCallingCode: user.countryCallingCode, whatsAppNumber: user.whatsAppNumber } };
  }
}
