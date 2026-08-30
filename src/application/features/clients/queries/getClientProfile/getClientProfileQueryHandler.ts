import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IUserRepository } from '../../../auth/common/ports.js';
import { toClientProfileResponse } from '../../common/clientProfileResponse.js';
import { GetClientProfileQuery, type GetClientProfileResult } from './getClientProfileQuery.js';

export class GetClientProfileQueryHandler implements IQueryHandler<GetClientProfileQuery, GetClientProfileResult> {
  constructor(private readonly userRepository: IUserRepository) {}

  async handle(query: GetClientProfileQuery): Promise<GetClientProfileResult> {
    const user = await this.userRepository.getById(query.userId);
    if (!user) {
      return { outcome: 'not_found' };
    }
    return { outcome: 'success', profile: toClientProfileResponse(user) };
  }
}
