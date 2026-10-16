import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { ICountryLookup } from '../../../goalkeeperRequests/common/ports.js';
import type { IMarketRepository } from '../../../markets/common/ports.js';
import type { IZoneRepository } from '../../../zones/common/ports.js';
import { changesCountry, marketChangeRefusal, type MarketChangeRefusal, type MarketChangeTarget } from '../../../../../domain/goalkeepers/marketChange.js';
import { findActiveGoalkeeperProfile } from '../../common/findActiveGoalkeeperProfile.js';
import { toActiveGoalkeeperResponse } from '../../common/goalkeeperRegistrationResponse.js';
import type { IGoalkeeperMarketChangeStore, IGoalkeeperProfileRepository, IGoalkeeperRegistrationRepository } from '../../common/ports.js';
import { validateAvailabilitySelection } from '../../common/validateAvailabilitySelection.js';
import { ChangeGoalkeeperMarketCommand, type ChangeGoalkeeperMarketResult } from './changeGoalkeeperMarketCommand.js';

export interface ChangeGoalkeeperMarketDependencies {
  profiles: IGoalkeeperProfileRepository;
  registrations: IGoalkeeperRegistrationRepository;
  markets: Pick<IMarketRepository, 'getById'>;
  zones: IZoneRepository;
  countries: ICountryLookup;
  store: IGoalkeeperMarketChangeStore;
  clock: IClock;
}

const refused = ({ kind, ...details }: MarketChangeRefusal): ChangeGoalkeeperMarketResult => ({ outcome: kind, ...details }) as ChangeGoalkeeperMarketResult;

/** Nothing open yet: what the market and the zones alone decide, before the transaction. */
const NOTHING_OPEN = { assignedBookingIds: [], balance: null, currency: null, pendingDepositId: null, closureOpen: false };

export class ChangeGoalkeeperMarketCommandHandler implements ICommandHandler<ChangeGoalkeeperMarketCommand, ChangeGoalkeeperMarketResult> {
  constructor(private readonly deps: ChangeGoalkeeperMarketDependencies) {}

  async handle({ userId, marketId, zoneIds }: ChangeGoalkeeperMarketCommand): Promise<ChangeGoalkeeperMarketResult> {
    const lookup = await findActiveGoalkeeperProfile(this.deps.profiles, this.deps.registrations, userId);
    if (!lookup.found) return { outcome: lookup.outcome };

    const [current, target] = await Promise.all([this.deps.markets.getById(lookup.profile.marketId), this.deps.markets.getById(marketId)]);
    const change: MarketChangeTarget = {
      currentMarketId: lookup.profile.marketId,
      currentCountryId: current?.countryId ?? '',
      target: target ? { id: target.id, countryId: target.countryId, status: target.status } : null,
    };
    const early = marketChangeRefusal(change, NOTHING_OPEN);
    if (early) return refused(early);

    const selection = await validateAvailabilitySelection(this.deps.markets, this.deps.zones, marketId, zoneIds);
    if (!selection.valid) return selection.outcome === 'invalid_zones' ? { outcome: 'invalid_zones', invalidZoneIds: selection.invalidZoneIds } : { outcome: 'market_not_available' };
    if (selection.zoneIds.length === 0) return { outcome: 'invalid_zones', invalidZoneIds: [] };

    let currency: string | null = null;
    if (changesCountry(change)) {
      currency = (await this.deps.countries.getById(target!.countryId))?.currency ?? null;
      if (!currency) return { outcome: 'market_not_available' };
    }

    const result = await this.deps.store.changeMarket({
      userId,
      marketId,
      zoneIds: selection.zoneIds,
      now: this.deps.clock.now(),
      currency,
      decide: (facts) => marketChangeRefusal(change, facts),
    });
    if (result.kind === 'refused') return refused(result.refusal);
    if (result.kind === 'not_a_goalkeeper') return { outcome: 'not_a_goalkeeper' };
    return { outcome: 'changed', goalkeeper: { ...toActiveGoalkeeperResponse(result.profile), market: { id: target!.id, name: target!.name } } };
  }
}
