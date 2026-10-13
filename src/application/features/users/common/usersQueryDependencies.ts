import type { IUserRepository } from '../../auth/common/ports.js';
import type { ICountryRepository } from '../../profile/common/ports.js';
import type { IGoalkeeperProfileRepository } from '../../goalkeepers/common/ports.js';
import type { IStaffMemberRepository } from '../../staff/common/ports.js';
import type { IUserAdminReader, IUserBlockRepository } from './ports.js';

/** What the admin's user queries read (admin spec 005). */
export interface UsersQueryDependencies {
  users: IUserRepository;
  profiles: Pick<IGoalkeeperProfileRepository, 'getByUserId'>;
  blocks: IUserBlockRepository;
  countries: ICountryRepository;
  staff: Pick<IStaffMemberRepository, 'findByUserId'>;
  reader: IUserAdminReader;
}
