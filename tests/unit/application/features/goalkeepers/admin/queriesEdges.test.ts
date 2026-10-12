import { describe, expect, it } from 'vitest';
import { ListGoalkeepersQuery } from '../../../../../../src/application/features/goalkeepers/queries/listGoalkeepers/listGoalkeepersQuery.js';
import { ListGoalkeepersQueryHandler } from '../../../../../../src/application/features/goalkeepers/queries/listGoalkeepers/listGoalkeepersQueryHandler.js';
import { GetGoalkeeperAdminQuery } from '../../../../../../src/application/features/goalkeepers/queries/getGoalkeeperAdmin/getGoalkeeperAdminQuery.js';
import { GetGoalkeeperAdminQueryHandler } from '../../../../../../src/application/features/goalkeepers/queries/getGoalkeeperAdmin/getGoalkeeperAdminQueryHandler.js';
import { GetGoalkeeperRegistrationAdminQuery } from '../../../../../../src/application/features/goalkeepers/queries/getGoalkeeperRegistrationAdmin/getGoalkeeperRegistrationAdminQuery.js';
import { GetGoalkeeperRegistrationAdminQueryHandler } from '../../../../../../src/application/features/goalkeepers/queries/getGoalkeeperRegistrationAdmin/getGoalkeeperRegistrationAdminQueryHandler.js';
import { GetGoalkeeperDocumentQuery } from '../../../../../../src/application/features/goalkeepers/queries/getGoalkeeperDocument/getGoalkeeperDocumentQuery.js';
import { GetGoalkeeperDocumentQueryHandler } from '../../../../../../src/application/features/goalkeepers/queries/getGoalkeeperDocument/getGoalkeeperDocumentQueryHandler.js';
import { WithdrawalAdminDetails } from '../../../../../../src/application/features/bookingLifecycle/common/withdrawalAdminDetails.js';
import { GoalkeeperRegistration } from '../../../../../../src/domain/goalkeepers/goalkeeperRegistration.js';
import type { Booking } from '../../../../../../src/domain/bookings/booking.js';
import type { Zone } from '../../../../../../src/domain/zones/zone.js';
import { FakeGoalkeeperProfileRepository } from '../../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeGoalkeeperRegistrationRepository } from '../../../../../fakes/fakeGoalkeeperRegistrationRepository.js';
import { FakeUserRepository } from '../../../../../fakes/fakeUserRepository.js';
import { FakeUserBlockRepository } from '../../../../../fakes/fakeUserBlockRepository.js';
import { buildGoalkeeperProfile } from '../../../../../fixtures/walletFixtures.js';

const NOW = new Date('2026-10-12T15:00:00.000Z');

function deps(profiles = new FakeGoalkeeperProfileRepository()) {
  return {
    reader: {
      list: async () => ({ totalItems: 1, items: [{ userId: 'ghost', cityId: null, zoneCount: 0, availableForOffers: true, suspendedUntil: null, balance: 0, currency: null, activatedAt: NOW }] }),
      ratingsFor: async () => new Map(),
      incidentCounts: async () => ({ withdrawal: 0, no_show: 0 }),
      upcomingBookings: async () => ({ total: 0, items: [] }),
    },
    userReader: { findIds: async () => [] },
    users: new FakeUserRepository(),
    blocks: new FakeUserBlockRepository(),
    profiles,
    cities: { getById: async () => null, getByIds: async () => [] },
    zones: { getManyByIds: async () => [] },
    documentTypes: { findByCode: async () => null },
    monthStats: async () => ({ outcome: 'not_a_goalkeeper' as const }),
    clock: { now: () => NOW },
  };
}

describe('goalkeeper queries with missing references (admin spec 005)', () => {
  it('a row whose user and city are gone has no name and no city; a short search does not filter', async () => {
    const result = await new ListGoalkeepersQueryHandler(deps()).handle(new ListGoalkeepersQuery({ q: 'a', page: 1, pageSize: 20 }));

    expect(result).toMatchObject({ outcome: 'ok', page: { items: [{ userId: 'ghost', name: null, city: null, rating: null, blocked: false }] } });
  });

  it('a detail whose city, zones and type are gone keeps their ids and code', async () => {
    const profiles = new FakeGoalkeeperProfileRepository();
    profiles.seed(buildGoalkeeperProfile('g1', { zoneIds: ['z-gone'] }));
    const result = await new GetGoalkeeperAdminQueryHandler(deps(profiles)).handle(new GetGoalkeeperAdminQuery('g1'));

    expect(result).toMatchObject({ outcome: 'ok', goalkeeper: { name: null, city: null, zones: [{ id: 'z-gone', name: 'z-gone', active: false }], documentType: { code: 'CC', name: 'CC' } } });
  });

  it('a document whose type is gone shows its code, and photos that are gone are null', async () => {
    const profiles = new FakeGoalkeeperProfileRepository();
    profiles.seed(buildGoalkeeperProfile('g1'));
    const result = await new GetGoalkeeperDocumentQueryHandler({ profiles, documentTypes: { findByCode: async () => null }, images: { getById: async () => null } }).handle(new GetGoalkeeperDocumentQuery('g1'));

    expect(result).toMatchObject({ outcome: 'ok', document: { documentType: { code: 'CC', name: 'CC' }, photos: { front: null, back: null } } });
  });

  it('a registration with a zone gone keeps its id', async () => {
    const registrations = new FakeGoalkeeperRegistrationRepository();
    const registration = GoalkeeperRegistration.createEmpty('r', 'u1');
    registration.availability = { cityId: 'gone', zoneIds: ['z-gone'] };
    registrations.seed(registration);
    const handler = new GetGoalkeeperRegistrationAdminQueryHandler({ registrations, users: new FakeUserRepository(), cities: { getByIds: async () => [] }, zones: { getManyByIds: async () => [] }, clock: { now: () => NOW } });

    expect(await handler.handle(new GetGoalkeeperRegistrationAdminQuery('u1'))).toMatchObject({
      outcome: 'ok', registration: { name: null, sections: { availability: { city: null, zones: [{ id: 'z-gone', name: 'z-gone' }] } } },
    });
  });

  it("a booking whose zone's city is gone has no clock", async () => {
    const details = new WithdrawalAdminDetails({
      bookings: { findById: async () => ({ id: 'b1', zoneId: 'z1' }) as Booking },
      zones: { getManyByIds: async () => [{ id: 'z1', cityId: 'gone' } as Zone] },
      cities: { getByIds: async () => [] },
      movements: { findByCauseKey: async () => null },
    });

    expect((await details.forBookings(['b1'])).get('b1')).toEqual({ match: { cityName: null, timeZone: null }, commission: null });
  });
});
