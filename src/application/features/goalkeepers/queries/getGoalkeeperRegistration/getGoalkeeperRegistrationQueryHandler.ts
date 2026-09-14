import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IGoalkeeperRegistrationRepository } from '../../common/ports.js';
import { toGoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';
import { GetGoalkeeperRegistrationQuery, type GetGoalkeeperRegistrationResult } from './getGoalkeeperRegistrationQuery.js';

export class GetGoalkeeperRegistrationQueryHandler
  implements IQueryHandler<GetGoalkeeperRegistrationQuery, GetGoalkeeperRegistrationResult>
{
  constructor(private readonly goalkeeperRegistrationRepository: IGoalkeeperRegistrationRepository) {}

  async handle(query: GetGoalkeeperRegistrationQuery): Promise<GetGoalkeeperRegistrationResult> {
    const registration = await this.goalkeeperRegistrationRepository.getByUserId(query.userId);
    return { registration: toGoalkeeperRegistrationResponse(registration) };
  }
}
