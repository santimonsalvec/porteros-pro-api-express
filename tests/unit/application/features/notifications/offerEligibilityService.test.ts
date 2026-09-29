import { describe, expect, it } from 'vitest';
import { OfferEligibilityService } from '../../../../../src/application/features/notifications/common/offerEligibilityService.js';
import type { IWalletRepository } from '../../../../../src/application/features/wallet/common/ports.js';
import type { Booking } from '../../../../../src/domain/bookings/booking.js';
import { Wallet } from '../../../../../src/domain/wallet/wallet.js';
import { FakeBookingRepository } from '../../../../fakes/fakeBookingRepository.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { buildBooking, OFFER_NOW } from '../../../../fixtures/offerFixtures.js';
import { buildGoalkeeperProfile } from '../../../../fixtures/walletFixtures.js';
import { fixedVatRates } from '../../../../fakes/fakeVatRates.js';

const at = (iso: string) => new Date(iso);

function world() {
  const profiles = new FakeGoalkeeperProfileRepository();
  const bookings = new FakeBookingRepository();
  const balances = new Map<string, number>();
  const walletRepository: IWalletRepository = {
    findByGoalkeeperId: async (id) => (balances.has(id) ? wallet(id, balances.get(id)!) : null),
    findByGoalkeeperIds: async (ids) => ids.filter((id) => balances.has(id)).map((id) => wallet(id, balances.get(id)!)),
  };
  // Bello and Copacabana cost 7.000; an unconfigured zone is never offered.
  const commissionResolver = {
    resolveForZones: async (zoneIds: string[]) =>
      new Map(zoneIds.map((zoneId) => [zoneId, zoneId === 'zone-unconfigured' ? null : 7000] as const)),
  };
  const service = new OfferEligibilityService({ goalkeeperProfileRepository: profiles, walletRepository, commissionResolver, bookingRepository: bookings, vatRates: fixedVatRates(0) });
  const goalkeeper = (id: string, balance: number, overrides: Parameters<typeof buildGoalkeeperProfile>[1] = {}) => {
    profiles.seed(buildGoalkeeperProfile(id, { zoneIds: ['zone-bello'], ...overrides }));
    balances.set(id, balance);
  };
  return { profiles, bookings, service, goalkeeper };
}

function wallet(goalkeeperId: string, balance: number): Wallet {
  return Wallet.rehydrate({ goalkeeperId, currency: 'COP', balance, lastSequence: 1, createdAt: OFFER_NOW, updatedAt: OFFER_NOW });
}

/** The same six situations used across the feature's tests, plus the client who is also a goalkeeper. */
function seedScenario(w: ReturnType<typeof world>): Booking {
  const booking = buildBooking();
  w.bookings.seed(booking);
  w.goalkeeper('eligible', 20000);
  w.goalkeeper('suspended', 20000, { suspendedUntil: at('2026-10-10T00:00:00.000Z') });
  w.goalkeeper('poor', 6000);
  w.goalkeeper('switched-off', 20000, { availableForOffers: false });
  w.goalkeeper('other-zone', 20000, { zoneIds: ['zone-copacabana'] });
  w.goalkeeper('clashing', 20000);
  w.bookings.seed(
    buildBooking({ id: 'held', requestId: 'request-9', startsAt: at('2026-10-04T22:00:00.000Z'), status: 'assigned', goalkeeperId: 'clashing', assignedAt: OFFER_NOW }),
  );
  w.goalkeeper('client-1', 20000);
  return booking;
}

describe('OfferEligibilityService', () => {
  it('finds exactly the goalkeepers who can take a booking', async () => {
    const w = world();
    const booking = seedScenario(w);

    const eligible = await w.service.eligibleGoalkeepersFor([booking], OFFER_NOW);

    expect([...eligible.keys()]).toEqual(['eligible']);
    expect(eligible.get('eligible')!.map((item) => item.id)).toEqual(['booking-1']);
  });

  it('returns nothing for no bookings', async () => {
    expect((await world().service.eligibleGoalkeepersFor([], OFFER_NOW)).size).toBe(0);
  });

  it('explains an empty list in order: switched off, then suspended, then funds', async () => {
    const w = world();
    w.goalkeeper('off-and-suspended', 20000, { availableForOffers: false, suspendedUntil: at('2026-10-10T00:00:00.000Z') });
    w.goalkeeper('suspended-and-poor', 0, { suspendedUntil: at('2026-10-10T00:00:00.000Z') });
    w.goalkeeper('poor', 5000);

    expect(await w.service.availableBookingsFor('off-and-suspended', OFFER_NOW)).toMatchObject({ kind: 'unavailable', reason: 'not_available_for_offers' });
    expect(await w.service.availableBookingsFor('suspended-and-poor', OFFER_NOW)).toMatchObject({ kind: 'unavailable', reason: 'suspended' });
    expect(await w.service.availableBookingsFor('poor', OFFER_NOW)).toEqual({
      kind: 'unavailable',
      reason: 'insufficient_funds',
      missingAmount: 2000,
      suspendedUntil: null,
    });
    expect(await w.service.availableBookingsFor('nobody', OFFER_NOW)).toEqual({ kind: 'not_a_goalkeeper' });
  });

  it('agrees in both directions for every goalkeeper and booking (FR-002)', async () => {
    const w = world();
    seedScenario(w);
    w.bookings.seed(buildBooking({ id: 'b-copa', requestId: 'request-2', zoneId: 'zone-copacabana' }));
    w.bookings.seed(buildBooking({ id: 'b-pricey', requestId: 'request-3', commission: 25000 }));
    w.bookings.seed(buildBooking({ id: 'b-ended', requestId: 'request-4', searchEndsAt: OFFER_NOW }));
    w.bookings.seed(buildBooking({ id: 'b-same-1', requestId: 'request-5', startsAt: at('2026-10-06T21:00:00.000Z') }));
    w.bookings.seed(
      buildBooking({ id: 'b-same-2', requestId: 'request-5', startsAt: at('2026-10-06T21:00:00.000Z'), status: 'assigned', goalkeeperId: 'eligible', assignedAt: OFFER_NOW }),
    );
    const pending = w.bookings.all().filter((booking) => booking.status === 'pending_assignment');
    const goalkeepers = ['eligible', 'suspended', 'poor', 'switched-off', 'other-zone', 'clashing', 'client-1'];

    const byBooking = await w.service.eligibleGoalkeepersFor(pending, OFFER_NOW);
    for (const goalkeeperId of goalkeepers) {
      const own = await w.service.availableBookingsFor(goalkeeperId, OFFER_NOW);
      const fromGoalkeeper = own.kind === 'ok' ? own.bookings.map((booking) => booking.id).sort() : [];
      const fromBookings = (byBooking.get(goalkeeperId) ?? []).map((booking) => booking.id).sort();
      expect(fromGoalkeeper, goalkeeperId).toEqual(fromBookings);
    }
    expect(byBooking.get('eligible')!.map((booking) => booking.id).sort()).toEqual(['booking-1']);
    expect(byBooking.get('other-zone')!.map((booking) => booking.id)).toEqual(['b-copa']);
  });
});
