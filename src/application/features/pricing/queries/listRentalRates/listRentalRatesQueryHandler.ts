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
    const geography = await PricingGeography.load(this.deps, records.filter((record) => record.scope === 'city').map((record) => record.refId));
    const rows = records
      .map((record) => ({ view: rentalRateView(record, geography.target(record.scope, record.refId)), order: geography.zone(record.refId)?.displayOrder ?? -1 }))
      .filter(({ view }) => filters.countryId === undefined || view.countryId === filters.countryId)
      .sort(
        (a, b) =>
          compareNames(a.view.cityName, b.view.cityName) ||
          a.view.durationMinutes - b.view.durationMinutes ||
          (a.view.scope === 'city' ? -1 : a.order) - (b.view.scope === 'city' ? -1 : b.order) ||
          compareTiers(a.view, b.view) ||
          a.view.id.localeCompare(b.view.id),
      )
      .map(({ view }) => view);
    const start = (page - 1) * pageSize;
    return pageOf(rows.slice(start, start + pageSize), page, pageSize, rows.length);
  }

  /** A city filter reads its own rates and its zones'; a zone filter, only that zone's. */
  private async refsFor({ cityId, zoneId }: RentalRateFilters): Promise<RefFilter> {
    if (zoneId !== undefined) return [{ scope: 'zone', refIds: [zoneId] }];
    if (cityId === undefined) return null;
    const zones = await this.deps.zones.summariesByCities([cityId]);
    return [
      { scope: 'city', refIds: [cityId] },
      { scope: 'zone', refIds: zones.map((zone) => zone.id) },
    ];
  }
}
