import type { BillingData } from '../../../../domain/goalkeepers/billing.js';
import type { ICityRepository, IRegionRepository } from '../../locations/common/ports.js';

/** Where the names of a billing municipality and its department are read (spec 031). */
export interface BillingPlaces {
  cities: Pick<ICityRepository, 'getById'>;
  regions: Pick<IRegionRepository, 'getByIds'>;
}

export interface BillingView extends BillingData {
  cityName: string | null;
  stateName: string | null;
}

/** The billing data with its municipality's and department's names; `null` names when unknown. */
export async function billingWithPlaceNames(billing: BillingData, places: BillingPlaces | undefined): Promise<BillingView> {
  const view = { cityId: billing.cityId, address: billing.address, addressComplement: billing.addressComplement };
  if (!places || billing.cityId === null) return { ...view, cityName: null, stateName: null };
  const city = await places.cities.getById(billing.cityId);
  const [region] = city ? await places.regions.getByIds([city.regionId]) : [];
  return { ...view, cityName: city?.name ?? null, stateName: region?.name ?? null };
}
