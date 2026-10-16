import { Zone } from '../../../../../src/domain/zones/zone.js';
import { FakeBookingSettingsAdmin, FakeCommissionAdmin, FakeRentalRateAdmin } from '../../../../fakes/fakePricingAdmin.js';
import { FakeTaxSettingsRepository } from '../../../../fakes/fakeTaxSettingsRepository.js';
import { geographyKit } from '../geography/geographyTestKit.js';

const square = { type: 'Polygon' as const, coordinates: [[[-75.6, 6.2], [-75.58, 6.2], [-75.58, 6.22], [-75.6, 6.22], [-75.6, 6.2]]] };

/**
 * The geography kit (Colombia, Medellín with Laureles, Envigado, Itagüí) plus the zones Bello and
 * El Poblado, an inactive Robledo, and empty in-memory price stores (spec 004 of the admin).
 */
export function pricingKit() {
  const kit = geographyKit();
  const zone = (id: string, name: string, displayOrder: number, active = true) =>
    kit.zones.items.set(id, new Zone({ id, marketId: 'med', name, slug: id, geometry: square, active, displayOrder }));
  zone('bello', 'Bello', 2);
  zone('poblado', 'El Poblado', 3);
  zone('robledo', 'Robledo', 4, false);
  const taxSettings = new FakeTaxSettingsRepository();
  taxSettings.seed('co', 1900);
  return {
    ...kit,
    rentalRates: new FakeRentalRateAdmin(),
    commissions: new FakeCommissionAdmin(),
    bookingSettings: new FakeBookingSettingsAdmin(),
    taxSettings,
  };
}
