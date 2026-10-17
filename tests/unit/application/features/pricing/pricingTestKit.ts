import { Zone } from '../../../../../src/domain/zones/zone.js';
import { FakeBookingSettingsAdmin, FakeCommissionAdmin, FakeRentalRateAdmin } from '../../../../fakes/fakePricingAdmin.js';
import { FakeTaxSettingsRepository } from '../../../../fakes/fakeTaxSettingsRepository.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { buildGoalkeeperProfile } from '../../../../fixtures/operatingBalanceFixtures.js';
import { User } from '../../../../../src/domain/users/user.js';
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
  // Feature 033: a goalkeeper of Medellín (zones Bello and El Poblado) the admin can give a rule of their own.
  const goalkeeperProfiles = new FakeGoalkeeperProfileRepository();
  goalkeeperProfiles.seed(buildGoalkeeperProfile('gk-1', { marketId: 'med', zoneIds: ['bello', 'poblado'] }));
  const users = new FakeUserRepository();
  const juan = User.createFromExternalIdentity({ id: 'gk-1', email: 'gk-1@example.com', displayName: null, provider: 'google', subject: 'gk-1' });
  juan.completeProfile('Juan', 'Pérez', '+57', '300 111 2222');
  users.seed(juan);
  return {
    ...kit,
    rentalRates: new FakeRentalRateAdmin(),
    commissions: new FakeCommissionAdmin(),
    bookingSettings: new FakeBookingSettingsAdmin(),
    taxSettings,
    goalkeeperProfiles,
    users,
    clock: new FixedClock(new Date('2026-10-17T12:00:00Z')),
  };
}
