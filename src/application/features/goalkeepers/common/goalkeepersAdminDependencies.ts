import type { BillingPlaces } from './billingPlaces.js';
import type { IClock } from '../../../common/clock.js';
import type { IUserRepository } from '../../auth/common/ports.js';
import type { IAdminMarketRepository } from '../../markets/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';
import type { IUserAdminReader, IUserBlockRepository } from '../../users/common/ports.js';
import type { GetGoalkeeperMonthStatsResult } from '../queries/getGoalkeeperMonthStats/getGoalkeeperMonthStatsQuery.js';
import type { IDocumentTypeRepository, IGoalkeeperProfileRepository } from './ports.js';
import type { IGoalkeeperAdminReader } from './adminPorts.js';

/** What the admin's goalkeeper queries read (admin spec 005). */
export interface GoalkeepersAdminDependencies {
  reader: IGoalkeeperAdminReader;
  userReader: Pick<IUserAdminReader, 'findIds'>;
  users: Pick<IUserRepository, 'getById' | 'getByIds'>;
  blocks: IUserBlockRepository;
  profiles: Pick<IGoalkeeperProfileRepository, 'getByUserId'>;
  markets: Pick<IAdminMarketRepository, 'getById' | 'getByIds' | 'listByCountry'>;
  zones: Pick<IZoneRepository, 'getManyByIds'>;
  documentTypes: Pick<IDocumentTypeRepository, 'findByCode'>;
  /** This month's numbers (feature 026), through its own query: never a second implementation. */
  monthStats: (goalkeeperId: string) => Promise<GetGoalkeeperMonthStatsResult>;
  clock: IClock;
  /** Spec 031: the names of the billing municipality and its department. */
  places?: BillingPlaces;
}
