import { IQuery } from '../../../../common/mediator/types.js';

export interface PricingAreas {
  countries: { id: string; name: string; currency: string | null }[];
  /** The cities that own zones, with their zones in display order. */
  cities: { id: string; name: string; countryId: string | null; zones: { id: string; name: string; active: boolean }[] }[];
}

/**
 * Where prices can hang, for the admin's pickers (spec 004): needs only `pricing.read`, so a
 * member who prices does not also need `geography.read`. A few dozen cities at most.
 */
export class ListPricingAreasQuery extends IQuery<PricingAreas> {}
