import { describe, expect, it } from 'vitest';
import { ListGoalkeeperWithdrawalsQuery } from '../../../../../src/application/features/bookingLifecycle/queries/listGoalkeeperWithdrawals/listGoalkeeperWithdrawalsQuery.js';
import { ListGoalkeeperWithdrawalsQueryHandler } from '../../../../../src/application/features/bookingLifecycle/queries/listGoalkeeperWithdrawals/listGoalkeeperWithdrawalsQueryHandler.js';
import { WithdrawalAdminDetails } from '../../../../../src/application/features/bookingLifecycle/common/withdrawalAdminDetails.js';
import type { Booking } from '../../../../../src/domain/bookings/booking.js';
import type { Zone } from '../../../../../src/domain/zones/zone.js';
import type { City } from '../../../../../src/domain/locations/city.js';
import type { WalletMovement } from '../../../../../src/domain/wallet/walletMovement.js';
import { lifecycleHarness } from './lifecycleHarness.js';

describe('WithdrawalAdminDetails (admin spec 005, research §13)', () => {
  const details = new WithdrawalAdminDetails({
    bookings: { findById: async (id) => (id === 'b1' ? ({ id: 'b1', zoneId: 'z1' } as Booking) : null) },
    zones: { getManyByIds: async (ids) => (ids.includes('z1') ? [{ id: 'z1', cityId: 'med' } as Zone] : []) },
    cities: { getByIds: async (ids) => (ids.includes('med') ? [{ id: 'med', name: 'Medellín', timeZone: 'America/Bogota' } as City] : []) },
    movements: { findByCauseKey: async (key) => (key === 'commission:b1' ? ({ amount: -7000, currency: 'COP' } as WalletMovement) : null) },
  });

  it("gives each booking its city's clock and the commission charged, positive", async () => {
    expect(await details.forBookings(['b1'])).toEqual(
      new Map([['b1', { match: { cityName: 'Medellín', timeZone: 'America/Bogota' }, commission: { amount: 7000, currency: 'COP' } }]]),
    );
  });

  it('leaves blanks for a booking that no longer exists and has no charge', async () => {
    expect((await details.forBookings(['gone'])).get('gone')).toEqual({ match: { cityName: null, timeZone: null }, commission: null });
  });
});

describe('ListGoalkeeperWithdrawalsQuery with admin details', () => {
  it('adds them to the admin view only; the goalkeeper view stays as it was', async () => {
    const h = lifecycleHarness();
    const booking = h.match('r1', 1).bookings[0]!;
    await h.acceptAndPay(booking, 'g');
    await h.withdraw(booking.id, 'g');
    const extra = { match: { cityName: 'Cali', timeZone: 'America/Bogota' }, commission: { amount: 7000, currency: 'COP' } };
    const handler = new ListGoalkeeperWithdrawalsQueryHandler({
      goalkeeperProfileRepository: h.goalkeeperProfileRepository,
      incidents: h.incidents,
      clock: h.clock,
      adminDetails: { forBookings: async (ids) => new Map(ids.map((id) => [id, extra])) },
    });

    const admin = await handler.handle(new ListGoalkeeperWithdrawalsQuery('g', 1, 20, 'admin'));
    const own = await handler.handle(new ListGoalkeeperWithdrawalsQuery('g', 1, 20, 'goalkeeper'));

    expect(admin.outcome === 'ok' && admin.items[0]).toMatchObject(extra);
    expect(own.outcome === 'ok' && own.items[0]).not.toHaveProperty('match');
    expect(own.outcome === 'ok' && own.items[0]).not.toHaveProperty('commission');
  });
});
