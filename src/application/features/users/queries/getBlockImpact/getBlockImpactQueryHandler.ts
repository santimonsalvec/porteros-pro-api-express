import type { IClock } from '../../../../common/clock.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IUserRepository } from '../../../auth/common/ports.js';
import type { IGoalkeeperAdminReader } from '../../../goalkeepers/common/adminPorts.js';
import type { IGoalkeeperProfileRepository } from '../../../goalkeepers/common/ports.js';
import type { IMarketRepository } from '../../../markets/common/ports.js';
import type { IZoneRepository } from '../../../zones/common/ports.js';
import type { IUserAdminReader, ScheduledRecord } from '../../common/ports.js';
import type { ScheduledItem } from '../../common/views.js';
import { GetBlockImpactQuery, type GetBlockImpactResult } from './getBlockImpactQuery.js';

/** How many of each are listed; the total says how many more there are. */
const LISTED = 20;

export class GetBlockImpactQueryHandler implements IQueryHandler<GetBlockImpactQuery, GetBlockImpactResult> {
  constructor(
    private readonly deps: {
      users: Pick<IUserRepository, 'getById'>;
      profiles: Pick<IGoalkeeperProfileRepository, 'getByUserId'>;
      userReader: Pick<IUserAdminReader, 'openRequests'>;
      goalkeeperReader: Pick<IGoalkeeperAdminReader, 'upcomingBookings'>;
      zones: Pick<IZoneRepository, 'getManyByIds'>;
      markets: Pick<IMarketRepository, 'getByIds'>;
      clock: IClock;
    },
  ) {}

  async handle({ userId }: GetBlockImpactQuery): Promise<GetBlockImpactResult> {
    if (!(await this.deps.users.getById(userId))) return { outcome: 'not_found' };
    const now = this.deps.clock.now();
    const profile = await this.deps.profiles.getByUserId(userId);
    const [openRequests, upcomingBookings] = await Promise.all([
      this.deps.userReader.openRequests(userId, now, LISTED),
      profile ? this.deps.goalkeeperReader.upcomingBookings(userId, now, LISTED) : Promise.resolve({ total: 0, items: [] }),
    ]);
    const place = await this.places([...openRequests.items, ...upcomingBookings.items]);
    return {
      outcome: 'ok',
      impact: {
        isGoalkeeper: profile !== null,
        availableForOffers: profile ? profile.availableForOffers : null,
        openRequests: { total: openRequests.total, items: openRequests.items.map(place) },
        upcomingBookings: { total: upcomingBookings.total, items: upcomingBookings.items.map(place) },
      },
    };
  }

  /** Puts each item on its city's clock (zone → city). */
  private async places(records: ScheduledRecord[]): Promise<(record: ScheduledRecord) => ScheduledItem> {
    const zones = await this.deps.zones.getManyByIds([...new Set(records.flatMap((record) => (record.zoneId ? [record.zoneId] : [])))]);
    const markets = await this.deps.markets.getByIds([...new Set(zones.map((zone) => zone.marketId))]);
    const cityOfZone = new Map(zones.map((zone) => [zone.id, markets.find((market) => market.id === zone.marketId)]));
    return (record) => {
      const city = record.zoneId ? cityOfZone.get(record.zoneId) : undefined;
      return {
        id: record.id,
        ...(record.requestId ? { requestId: record.requestId } : {}),
        startsAt: record.startsAt.toISOString(),
        marketName: city?.name ?? null,
        timeZone: city?.timeZone ?? null,
      };
    };
  }
}
