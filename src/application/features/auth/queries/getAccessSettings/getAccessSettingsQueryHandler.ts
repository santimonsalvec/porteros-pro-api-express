import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { toAccessSettingsResponse, type AccessSettingsResponse } from '../../common/accessSettingsResponse.js';
import type { IAccessSettingsRepository } from '../../common/ports.js';
import { GetAccessSettingsQuery } from './getAccessSettingsQuery.js';

export class GetAccessSettingsQueryHandler implements IQueryHandler<GetAccessSettingsQuery, AccessSettingsResponse> {
  constructor(private readonly repository: Pick<IAccessSettingsRepository, 'get'>) {}

  async handle(_query: GetAccessSettingsQuery): Promise<AccessSettingsResponse> {
    return toAccessSettingsResponse(await this.repository.get());
  }
}
