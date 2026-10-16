import type { IClock } from '../../../common/clock.js';
import type { IUserRepository } from '../../auth/common/ports.js';
import type { IMarketRepository } from '../../markets/common/ports.js';
import type { IStaffMemberRepository } from '../../staff/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import type { IRequestAdminReader } from './adminPorts.js';

/** What the admin's request queries read (admin spec 006, US1). */
export interface RequestsAdminDependencies {
  reader: IRequestAdminReader;
  users: Pick<IUserRepository, 'getByIds'>;
  markets: Pick<IMarketRepository, 'getByIds'>;
  zones: Pick<IZoneRepository, 'getManyByIds'>;
  staff: Pick<IStaffMemberRepository, 'findByUserId'>;
  clock: IClock;
}
