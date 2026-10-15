import type { IBookingRepository } from '../../goalkeeperRequests/common/ports.js';
import type { ICityRepository } from '../../locations/common/ports.js';
import type { IBalanceMovementRepository } from '../../operatingBalance/common/ports.js';
import type { IZoneRepository } from '../../zones/common/ports.js';

/** What the admin view adds to a withdrawal (admin spec 005, research §13). */
export interface WithdrawalAdminExtra {
  /** The match's city, so its date is shown on that city's clock. */
  match: { cityName: string | null; timeZone: string | null };
  /** The commission charged for the booking (its net amount); `null` when none was charged. */
  commission: { amount: number; currency: string } | null;
}

export interface IWithdrawalAdminDetails {
  forBookings(bookingIds: readonly string[]): Promise<Map<string, WithdrawalAdminExtra>>;
}

/**
 * Reads, per booking, the city (booking → zone → city) and the commission charged (its
 * `commission:<bookingId>` movement), so lifting a suspension asks for a refund only where there
 * is a commission to give back.
 */
export class WithdrawalAdminDetails implements IWithdrawalAdminDetails {
  constructor(
    private readonly deps: {
      bookings: Pick<IBookingRepository, 'findById'>;
      zones: Pick<IZoneRepository, 'getManyByIds'>;
      cities: Pick<ICityRepository, 'getByIds'>;
      movements: Pick<IBalanceMovementRepository, 'findByCauseKey'>;
    },
  ) {}

  async forBookings(bookingIds: readonly string[]): Promise<Map<string, WithdrawalAdminExtra>> {
    const bookings = await Promise.all(bookingIds.map((id) => this.deps.bookings.findById(id)));
    const zones = await this.deps.zones.getManyByIds([...new Set(bookings.flatMap((booking) => (booking ? [booking.zoneId] : [])))]);
    const cities = await this.deps.cities.getByIds([...new Set(zones.map((zone) => zone.cityId))]);
    const cityOfZone = new Map(zones.map((zone) => [zone.id, cities.find((city) => city.id === zone.cityId) ?? null]));
    const charges = await Promise.all(bookingIds.map((id) => this.deps.movements.findByCauseKey(`commission:${id}`)));

    return new Map(
      bookingIds.map((id, index) => {
        const booking = bookings[index];
        const city = booking ? (cityOfZone.get(booking.zoneId) ?? null) : null;
        const charge = charges[index];
        return [
          id,
          {
            match: { cityName: city?.name ?? null, timeZone: city?.timeZone ?? null },
            commission: charge ? { amount: Math.abs(charge.amount), currency: charge.currency } : null,
          },
        ];
      }),
    );
  }
}
