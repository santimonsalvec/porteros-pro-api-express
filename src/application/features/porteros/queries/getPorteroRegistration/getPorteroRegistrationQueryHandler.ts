import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IPorteroRegistrationRepository } from '../../common/ports.js';
import { toPorteroRegistrationResponse } from '../../common/porteroRegistrationResponse.js';
import { GetPorteroRegistrationQuery, type GetPorteroRegistrationResult } from './getPorteroRegistrationQuery.js';

export class GetPorteroRegistrationQueryHandler
  implements IQueryHandler<GetPorteroRegistrationQuery, GetPorteroRegistrationResult>
{
  constructor(private readonly porteroRegistrationRepository: IPorteroRegistrationRepository) {}

  async handle(query: GetPorteroRegistrationQuery): Promise<GetPorteroRegistrationResult> {
    const registration = await this.porteroRegistrationRepository.getByUserId(query.userId);
    return { registration: toPorteroRegistrationResponse(registration) };
  }
}
