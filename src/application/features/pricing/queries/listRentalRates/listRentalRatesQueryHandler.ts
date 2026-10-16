import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { pageOf, type Page } from '../../../geography/common/views.js';
import { compareNames, compareTiers } from '../../common/ordering.js';
import { PricingGeography, type PricingGeographyDependencies } from '../../common/pricingGeography.js';
import type { IRentalRateAdmin, RefFilter } from '../../common/ports.js';
import { rentalRateView, type RentalRateView } from '../../common/views.js';
import { ListRentalRatesQuery, type RentalRateFilters } from './listRentalRatesQuery.js';

export class ListRentalRatesQueryHandler implements IQueryHandler<ListRentalRatesQuery, Page<RentalRateView>> {
  constructor(private readonly deps: PricingGeographyDependencies & { rentalRates: IRentalRateAdmin }) {}

  async handle({ filters, page, pageSize }: ListRentalRatesQuery): Promise<Page<RentalRateView>> {
    const records = await this.deps.rentalRates.find({
      refs: await this.refsFor(filters),
      durationMinutes: filters.durationMinutes,
      modality: filters.modality,
    });
    const geography = await PricingGeography.load(this.deps);
    const rows = records
      .map((record) => ({ view: rentalRateView(record, geography.target(record.scope, record.refId)), order: geography.zone(record.refId)?.displayOrder ?? -1 }))
      .filter(({ view }) => filters.countryId === undefined || view.countryId === filters.countryId)
      .sort(
        (a, b) =>
          compareNames(a.view.marketName, b.view.marketName) ||
          a.view.durationMinutes - b.view.durationMinutes ||
          (a.view.scope === 'market' ? -1 : a.order) - (b.view.scope === 'market' ? -1 : b.order) ||
          compareTiers(a.view, b.view) ||
          a.view.id.localeCompare(b.view.id),
      )
      .map(({ view }) => view);
    const start = (page - 1) * pageSize;
    return pageOf(rows.slice(start, start + pageSize), page, pageSize, rows.length);
  }

  /** A market filter reads its own rates and its zones'; a zone filter, only that zone's. */
  private async refsFor({ marketId, zoneId }: RentalRateFilters): Promise<RefFilter> {
    if (zoneId !== undefined) return [{ scope: 'zone', refIds: [zoneId] }];
    if (marketId === undefined) return null;
    const zones = await this.deps.zones.summariesByMarkets([marketId]);
    return [
      { scope: 'market', refIds: [marketId] },
      { scope: 'zone', refIds: zones.map((zone) => zone.id) },
    ];
  }
}
