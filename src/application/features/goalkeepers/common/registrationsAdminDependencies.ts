import type { IClock } from '../../../common/clock.js';
import type { IUserRepository } from '../../auth/common/ports.js';
import type { ICityRepository } from '../../locations/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import type { IRegistrationAdminReader } from './adminPorts.js';
import type { IGoalkeeperRegistrationRepository } from './ports.js';

/** What the admin's registration queries read (admin spec 005, US7). */
export interface RegistrationsAdminDependencies {
  registrations: IRegistrationAdminReader & Pick<IGoalkeeperRegistrationRepository, 'getByUserId'>;
  users: Pick<IUserRepository, 'getById' | 'getByIds'>;
  cities: Pick<ICityRepository, 'getByIds'>;
  zones: Pick<IZoneRepository, 'getManyByIds'>;
  clock: IClock;
}
