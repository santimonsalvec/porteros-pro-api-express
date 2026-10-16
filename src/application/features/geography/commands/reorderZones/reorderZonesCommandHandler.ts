import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IAdminMarketRepository } from '../../../markets/common/ports.js';
import type { IAdminZoneRepository } from '../../common/ports.js';
import { checkZoneMarket } from '../../common/zoneChecks.js';
import { ReorderZonesCommand, type ReorderZonesResult } from './reorderZonesCommand.js';

export interface ReorderZonesDependencies {
  markets: Pick<IAdminMarketRepository, 'getById'>;
  zones: Pick<IAdminZoneRepository, 'summariesByMarkets' | 'reorder'>;
}

export class ReorderZonesCommandHandler implements ICommandHandler<ReorderZonesCommand, ReorderZonesResult> {
  constructor(private readonly deps: ReorderZonesDependencies) {}

  async handle(command: ReorderZonesCommand): Promise<ReorderZonesResult> {
    const market = await checkZoneMarket(this.deps.markets, command.marketId);
    if (market.outcome !== 'ok') return market;

    // Without polygons: they weigh up to ~300 KB each and the order needs none of them.
    const stored = new Map((await this.deps.zones.summariesByMarkets([command.marketId])).map((zone) => [zone.id, zone]));
    const sameZones = command.zones.length === stored.size && command.zones.every((entry) => stored.get(entry.id)?.revision === entry.revision);
    if (!sameZones) return { outcome: 'stale' };

    // Only the zones whose place changed are written (and get a new revision).
    const moved = command.zones
      .map((entry, index) => ({ ...entry, displayOrder: index + 1 }))
      .filter((entry) => stored.get(entry.id)!.displayOrder !== entry.displayOrder);
    if (moved.length > 0 && (await this.deps.zones.reorder(moved)) === 'stale') return { outcome: 'stale' };
    return { outcome: 'reordered', zoneIds: command.zones.map((entry) => entry.id) };
  }
}
