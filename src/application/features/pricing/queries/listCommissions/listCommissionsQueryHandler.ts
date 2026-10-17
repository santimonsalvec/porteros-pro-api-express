import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { pageOf, type Page } from '../../../geography/common/views.js';
import { compareNames, compareTiers } from '../../common/ordering.js';
import type { ICommissionAdmin, RefFilter } from '../../common/ports.js';
import type { CommissionView } from '../../common/views.js';
import { commissionViews, type CommissionViewDependencies } from './commissionViews.js';
import { ListCommissionsQuery, type CommissionFilters } from './listCommissionsQuery.js';

const SCOPE_ORDER = { country: 0, market: 1, zone: 2, goalkeeper: 3 } as const;

export class ListCommissionsQueryHandler implements IQueryHandler<ListCommissionsQuery, Page<CommissionView>> {
  constructor(private readonly deps: CommissionViewDependencies & { commissions: ICommissionAdmin }) {}

  async handle({ filters, page, pageSize }: ListCommissionsQuery): Promise<Page<CommissionView>> {
    // Without a scope, the geography levels only: goalkeeper rules are managed from the goalkeeper's page (feature 033).
    const records = (await this.deps.commissions.find({ refs: await this.refsFor(filters), modality: filters.modality })).filter(
      (record) => (filters.scope === undefined ? record.scope !== 'goalkeeper' : record.scope === filters.scope),
    );
    const { views, geography } = await commissionViews(this.deps, records);
    const order = (view: CommissionView) => (view.scope === 'zone' ? (geography.zone(view.refId)?.displayOrder ?? 0) : -1);
    const rows = views
      .filter((view) => filters.countryId === undefined || view.countryId === filters.countryId)
      .sort(
        (a, b) =>
          compareNames(a.countryName, b.countryName) ||
          SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] ||
          compareNames(a.marketName, b.marketName) ||
          order(a) - order(b) ||
          compareTiers(a, b) ||
          a.id.localeCompare(b.id),
      );
    const start = (page - 1) * pageSize;
    return pageOf(rows.slice(start, start + pageSize), page, pageSize, rows.length);
  }

  /** A market filter reads its own commissions and its zones'; a zone filter, only that zone's. */
  private async refsFor({ marketId, zoneId }: CommissionFilters): Promise<RefFilter> {
    if (zoneId !== undefined) return [{ scope: 'zone', refIds: [zoneId] }];
    if (marketId === undefined) return null;
    const zones = await this.deps.zones.summariesByMarkets([marketId]);
    return [
      { scope: 'market', refIds: [marketId] },
      { scope: 'zone', refIds: zones.map((zone) => zone.id) },
    ];
  }
}
