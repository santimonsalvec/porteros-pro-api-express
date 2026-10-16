import type { IUserRepository } from '../../auth/common/ports.js';
import type { IRequestAdminReader } from '../../goalkeeperRequests/common/adminPorts.js';
import type { IGoalkeeperRequestRepository } from '../../goalkeeperRequests/common/ports.js';
import type { GetRequestAdminResult } from '../../goalkeeperRequests/queries/getRequestAdmin/getRequestAdminQuery.js';
import type { IMarketRepository } from '../../markets/common/ports.js';
import type { IRatingRepository } from '../../ratings/common/ports.js';
import type { IStaffMemberRepository } from '../../staff/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import type { ICaseRepository } from './ports.js';

/** What the admin's case queries read (admin spec 006, US2). */
export interface CasesAdminDependencies {
  cases: Pick<ICaseRepository, 'search' | 'countMatching' | 'requestIdsMatching' | 'getById'>;
  ratings: Pick<IRatingRepository, 'getById'>;
  requests: Pick<IGoalkeeperRequestRepository, 'findByIds'>;
  requestReader: Pick<IRequestAdminReader, 'marketIdsOfCountry' | 'requestIdsInMarkets'>;
  /** The request's facts (US1), through its own query: the booking, its money and incidents are never rebuilt here. */
  requestDetail: (requestId: string) => Promise<GetRequestAdminResult>;
  users: Pick<IUserRepository, 'getByIds'>;
  markets: Pick<IMarketRepository, 'getByIds'>;
  zones: Pick<IZoneRepository, 'getManyByIds'>;
  staff: Pick<IStaffMemberRepository, 'findByUserId'>;
}
