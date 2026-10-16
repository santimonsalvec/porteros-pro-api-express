import type { ICityRepository } from '../../locations/common/ports.js';

/** A municipality an invoice can name: it exists and has its official codes (spec 031, FR-023). */
export async function isInvoiceableCity(cities: Pick<ICityRepository, 'getById'>, cityId: string): Promise<boolean> {
  const city = await cities.getById(cityId);
  return city !== null && city.daneStateCode !== null && city.daneCityCode !== null;
}
