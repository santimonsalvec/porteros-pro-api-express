import { beforeEach, describe, expect, it } from 'vitest';
import { ListGoalkeepersQuery } from '../../../../../../src/application/features/goalkeepers/queries/listGoalkeepers/listGoalkeepersQuery.js';
import { ListGoalkeepersQueryHandler } from '../../../../../../src/application/features/goalkeepers/queries/listGoalkeepers/listGoalkeepersQueryHandler.js';
import { GetGoalkeeperAdminQuery } from '../../../../../../src/application/features/goalkeepers/queries/getGoalkeeperAdmin/getGoalkeeperAdminQuery.js';
import { GetGoalkeeperAdminQueryHandler } from '../../../../../../src/application/features/goalkeepers/queries/getGoalkeeperAdmin/getGoalkeeperAdminQueryHandler.js';
import type { GoalkeepersAdminDependencies } from '../../../../../../src/application/features/goalkeepers/common/goalkeepersAdminDependencies.js';
import type { GetGoalkeeperMonthStatsResult } from '../../../../../../src/application/features/goalkeepers/queries/getGoalkeeperMonthStats/getGoalkeeperMonthStatsQuery.js';
import { documentVersion } from '../../../../../../src/domain/users/contactVersion.js';
import { GoalkeeperProfile } from '../../../../../../src/domain/goalkeepers/goalkeeperProfile.js';
import { User } from '../../../../../../src/domain/users/user.js';
import type { City } from '../../../../../../src/domain/locations/city.js';
import type { Zone } from '../../../../../../src/domain/zones/zone.js';
import type { DocumentType } from '../../../../../../src/domain/goalkeepers/documentType.js';
import { FakeGoalkeeperProfileRepository } from '../../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeUserRepository } from '../../../../../fakes/fakeUserRepository.js';
import { FakeUserBlockRepository } from '../../../../../fakes/fakeUserBlockRepository.js';
import type { IGoalkeeperAdminReader } from '../../../../../../src/application/features/goalkeepers/common/adminPorts.js';

const NOW = new Date('2026-10-12T15:00:00.000Z');
const MEDELLIN = { id: 'med', name: 'Medellín', timeZone: 'America/Bogota' } as City;
const ZONES = [{ id: 'poblado', name: 'El Poblado', active: true }, { id: 'bello', name: 'Bello', active: false }] as Zone[];
const CC = { code: 'CC', name: 'Cédula de ciudadanía' } as DocumentType;

function profile(userId: string, overrides: Partial<ConstructorParameters<typeof GoalkeeperProfile>[0]> = {}) {
  return new GoalkeeperProfile({
    id: `gp-${userId}`, userId, documentType: 'CC', documentNumber: '1020304050', issueDate: new Date('2016-01-01'), birthDate: new Date('1998-04-02T00:00:00.000Z'),
    documentPhotoAId: 'img-a', documentPhotoBId: 'img-b', heightCm: 186, weightKg: 80, cityId: 'med', zoneIds: ['poblado', 'bello'], activatedAt: NOW,
    ...overrides,
  });
}

describe('goalkeeper queries (admin spec 005, US2)', () => {
  let deps: GoalkeepersAdminDependencies;
  let profiles: FakeGoalkeeperProfileRepository;
  let blocks: FakeUserBlockRepository;
  let foundIds: string[];
  let monthStats: GetGoalkeeperMonthStatsResult;
  let listed: unknown[];

  beforeEach(() => {
    profiles = new FakeGoalkeeperProfileRepository();
    profiles.seed(profile('u-andres', { suspendedUntil: new Date('2026-10-18T23:00:00.000Z'), availableForOffers: false }));
    const users = new FakeUserRepository();
    const andres = User.createFromExternalIdentity({ id: 'u-andres', email: 'andres@x.co', displayName: null, provider: 'google', subject: 's1' });
    andres.completeProfile('Andrés', 'Ruiz', '+57', '3109998877');
    users.seed(andres);
    blocks = new FakeUserBlockRepository();
    foundIds = [];
    listed = [];
    monthStats = {
      outcome: 'success',
      stats: { month: { year: 2026, month: 10 }, currency: 'COP', earned: 330000, playedCount: 6, averagePerMatch: 55000, toPlay: 2, previous: { month: { year: 2026, month: 9 }, throughDay: 12, earned: 0 }, changePercent: null },
    } as GetGoalkeeperMonthStatsResult;
    const reader: IGoalkeeperAdminReader = {
      list: async (filter) => {
        listed.push(filter);
        return { totalItems: 1, items: [{ userId: 'u-andres', cityId: 'med', zoneCount: 2, availableForOffers: false, suspendedUntil: new Date('2026-10-18T23:00:00.000Z'), balance: -4000, currency: 'COP', activatedAt: NOW }] };
      },
      ratingsFor: async () => new Map([['u-andres', { average: 4.6, count: 18 }]]),
      incidentCounts: async () => ({ withdrawal: 1, no_show: 2 }),
      upcomingBookings: async () => ({ total: 0, items: [] }),
    };
    deps = {
      reader,
      userReader: { findIds: async (_q, limit) => foundIds.slice(0, limit) },
      users,
      blocks,
      profiles,
      cities: { getByIds: async (ids) => (ids.includes('med') ? [MEDELLIN] : []), getById: async (id) => (id === 'med' ? MEDELLIN : null) },
      zones: { getManyByIds: async (ids) => ZONES.filter((zone) => ids.includes(zone.id)) },
      documentTypes: { findByCode: async (code) => (code === 'CC' ? CC : null) },
      monthStats: async () => monthStats,
      clock: { now: () => NOW },
    };
  });

  describe('ListGoalkeepersQuery', () => {
    it('answers rows with name, city, rating, balance and the block', async () => {
      await blocks.block('u-andres', 'staff', 'Acoso', NOW);

      const result = await new ListGoalkeepersQueryHandler(deps).handle(new ListGoalkeepersQuery({ cityId: 'med', page: 1, pageSize: 20 }));

      expect(result).toEqual({
        outcome: 'ok',
        page: {
          items: [{
            userId: 'u-andres', name: 'Andrés Ruiz', city: { id: 'med', name: 'Medellín' }, zoneCount: 2, availableForOffers: false,
            suspendedUntil: '2026-10-18T23:00:00.000Z', balance: -4000, currency: 'COP', rating: { average: 4.6, count: 18 }, blocked: true,
          }],
          page: 1, pageSize: 20, totalItems: 1, totalPages: 1,
        },
      });
      expect(listed[0]).toMatchObject({ cityId: 'med', now: NOW });
    });

    it('resolves a search to user ids first', async () => {
      foundIds = ['u-andres', 'u-other'];

      await new ListGoalkeepersQueryHandler(deps).handle(new ListGoalkeepersQuery({ q: 'ruiz', page: 1, pageSize: 20 }));

      expect(listed[0]).toMatchObject({ userIds: ['u-andres', 'u-other'] });
    });

    it('refuses a search that finds more than 500 users', async () => {
      foundIds = Array.from({ length: 501 }, (_, index) => `u-${index}`);

      expect(await new ListGoalkeepersQueryHandler(deps).handle(new ListGoalkeepersQuery({ q: 'an', page: 1, pageSize: 20 }))).toEqual({ outcome: 'search_too_broad' });
      expect(listed).toEqual([]);
    });
  });

  describe('GetGoalkeeperAdminQuery', () => {
    it('answers the profile, zones, suspension, rating and stats, without the document number', async () => {
      const result = await new GetGoalkeeperAdminQueryHandler(deps).handle(new GetGoalkeeperAdminQuery('u-andres'));

      expect(result).toEqual({
        outcome: 'ok',
        goalkeeper: {
          userId: 'u-andres', name: 'Andrés Ruiz', birthDate: '1998-04-02T00:00:00.000Z', heightCm: 186, weightKg: 80, activatedAt: NOW.toISOString(),
          city: { id: 'med', name: 'Medellín', timeZone: 'America/Bogota' },
          zones: [{ id: 'poblado', name: 'El Poblado', active: true }, { id: 'bello', name: 'Bello', active: false }],
          availableForOffers: false, suspendedUntil: '2026-10-18T23:00:00.000Z', blocked: false,
          documentType: { code: 'CC', name: 'Cédula de ciudadanía' }, version: documentVersion({ documentType: 'CC', documentNumber: '1020304050' }),
          rating: { average: 4.6, count: 18 },
          stats: { month: { playedCount: 6, earned: 330000, toPlay: 2, currency: 'COP' }, withdrawalCount: 1, noShowCount: 2 },
        },
      });
      expect(JSON.stringify(result)).not.toContain('1020304050');
    });

    it("keeps the rest when the month can't be computed, and a past suspension is none", async () => {
      monthStats = { outcome: 'time_zone_not_configured', cityId: 'med' };
      profiles.seed(profile('u-andres', { suspendedUntil: new Date('2026-10-01T00:00:00.000Z') }));

      const result = await new GetGoalkeeperAdminQueryHandler(deps).handle(new GetGoalkeeperAdminQuery('u-andres'));

      expect(result.outcome === 'ok' && result.goalkeeper.stats.month).toBeNull();
      expect(result.outcome === 'ok' && result.goalkeeper.suspendedUntil).toBeNull();
    });

    it('names an unknown document type by its code, and answers not_a_goalkeeper for a client', async () => {
      profiles.seed(profile('u-andres', { documentType: 'XX' }));
      const handler = new GetGoalkeeperAdminQueryHandler(deps);

      expect((await handler.handle(new GetGoalkeeperAdminQuery('u-andres'))).outcome === 'ok').toBe(true);
      expect(await handler.handle(new GetGoalkeeperAdminQuery('u-client'))).toEqual({ outcome: 'not_a_goalkeeper' });
    });
  });
});
