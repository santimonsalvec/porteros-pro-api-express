import { beforeEach, describe, expect, it } from 'vitest';
import { ListGoalkeeperRegistrationsQuery } from '../../../../../../src/application/features/goalkeepers/queries/listGoalkeeperRegistrations/listGoalkeeperRegistrationsQuery.js';
import { ListGoalkeeperRegistrationsQueryHandler } from '../../../../../../src/application/features/goalkeepers/queries/listGoalkeeperRegistrations/listGoalkeeperRegistrationsQueryHandler.js';
import { GetGoalkeeperRegistrationAdminQuery } from '../../../../../../src/application/features/goalkeepers/queries/getGoalkeeperRegistrationAdmin/getGoalkeeperRegistrationAdminQuery.js';
import { GetGoalkeeperRegistrationAdminQueryHandler } from '../../../../../../src/application/features/goalkeepers/queries/getGoalkeeperRegistrationAdmin/getGoalkeeperRegistrationAdminQueryHandler.js';
import { GoalkeeperRegistration } from '../../../../../../src/domain/goalkeepers/goalkeeperRegistration.js';
import { User } from '../../../../../../src/domain/users/user.js';
import type { Market } from '../../../../../../src/domain/markets/market.js';
import type { Zone } from '../../../../../../src/domain/zones/zone.js';
import { FakeGoalkeeperRegistrationRepository } from '../../../../../fakes/fakeGoalkeeperRegistrationRepository.js';
import { FakeUserRepository } from '../../../../../fakes/fakeUserRepository.js';

const NOW = new Date('2026-10-12T15:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

function registration(userId: string, updatedDaysAgo: number, fill: (r: GoalkeeperRegistration) => void = () => undefined) {
  const r = GoalkeeperRegistration.createEmpty(`reg-${userId}`, userId);
  fill(r);
  r.updatedAt = daysAgo(updatedDaysAgo);
  return r;
}

describe('registrations in progress (admin spec 005, US7)', () => {
  let deps: ConstructorParameters<typeof ListGoalkeeperRegistrationsQueryHandler>[0];

  beforeEach(() => {
    const registrations = new FakeGoalkeeperRegistrationRepository();
    registrations.seed(registration('u1', 12, (r) => { r.physicalData = { heightCm: null, weightKg: 78 }; }));
    registrations.seed(registration('u2', 3, (r) => {
      r.saveIdentification({ documentType: 'CC', documentNumber: '1020304050', issueDate: daysAgo(4000), birthDate: daysAgo(9000) });
      r.identification.documentPhotoAId = 'a';
      r.identification.documentPhotoBId = 'b';
      r.availability = { marketId: 'med', zoneIds: ['z1'] };
      r.saveBilling({ cityId: 'env', address: 'Cra 43 # 10-20' });
    }));
    const done = registration('u3', 1);
    done.status = 'active';
    registrations.seed(done);
    const users = new FakeUserRepository();
    const camilo = User.createFromExternalIdentity({ id: 'u1', email: 'camilo@x.co', displayName: 'Camilo D', provider: 'google', subject: 's1' });
    users.seed(camilo);
    deps = {
      registrations,
      users,
      markets: {
        getByIds: async (ids) => (ids.includes('med') ? [{ id: 'med', name: 'Medellín' } as unknown as Market] : []),
        listByCountry: async () => [{ id: 'med', name: 'Medellín' } as unknown as Market],
      },
      zones: { getManyByIds: async (ids) => (ids.includes('z1') ? [{ id: 'z1', name: 'El Poblado' } as Zone] : []) },
      places: {
        cities: { getById: async (id) => (id === 'env' ? ({ id: 'env', name: 'Envigado', regionId: 'ant' } as never) : null) },
        regions: { getByIds: async (ids) => (ids.includes('ant') ? [{ id: 'ant', name: 'Antioquia' } as never] : []) },
      },
      clock: { now: () => NOW },
    };
  });

  it('lists the stuck ones first with their step, a summary per step and a page', async () => {
    const result = await new ListGoalkeeperRegistrationsQueryHandler(deps).handle(new ListGoalkeeperRegistrationsQuery({ page: 1, pageSize: 20 }));

    expect(result.summary).toEqual({ identification: 1, physicalData: 1, availability: 0, billing: 0, ready: 0 });
    expect(result.items).toEqual([
      { userId: 'u1', name: 'Camilo D', email: 'camilo@x.co', step: 'identification', completeSections: [], marketName: null, createdAt: expect.any(String), updatedAt: daysAgo(12).toISOString(), idleDays: 12 },
      expect.objectContaining({ userId: 'u2', name: null, email: null, step: 'physicalData', completeSections: ['identification', 'availability', 'billing'], marketName: 'Medellín', idleDays: 3 }),
    ]);
    expect(result).toMatchObject({ page: 1, pageSize: 20, totalItems: 2, totalPages: 1 });
  });

  it('filters by step (the summary keeps every step) and by idleness', async () => {
    const handler = new ListGoalkeeperRegistrationsQueryHandler(deps);

    const byStep = await handler.handle(new ListGoalkeeperRegistrationsQuery({ step: 'physicalData', page: 1, pageSize: 20 }));
    expect(byStep.items.map((row) => row.userId)).toEqual(['u2']);
    expect(byStep.summary.identification).toBe(1);
    const idle = await handler.handle(new ListGoalkeeperRegistrationsQuery({ idleDaysMin: 7, page: 1, pageSize: 20 }));
    expect(idle.items.map((row) => row.userId)).toEqual(['u1']);
  });

  it('shows the detail per section without the document, and nothing for an activated one', async () => {
    const handler = new GetGoalkeeperRegistrationAdminQueryHandler(deps);

    const detail = await handler.handle(new GetGoalkeeperRegistrationAdminQuery('u2'));
    expect(detail).toMatchObject({
      outcome: 'ok',
      registration: {
        userId: 'u2', step: 'physicalData',
        sections: {
          identification: { complete: true, fields: { documentNumber: 'complete' } },
          physicalData: { complete: false, fields: { heightCm: 'missing', weightKg: 'missing' }, values: { heightCm: null, weightKg: null } },
          availability: { complete: true, market: { id: 'med', name: 'Medellín' }, zones: [{ id: 'z1', name: 'El Poblado' }] },
          billing: { complete: true, cityId: 'env', cityName: 'Envigado', stateName: 'Antioquia', address: 'Cra 43 # 10-20', addressComplement: null },
        },
      },
    });
    expect(JSON.stringify(detail)).not.toContain('1020304050');
    expect(await handler.handle(new GetGoalkeeperRegistrationAdminQuery('u3'))).toEqual({ outcome: 'not_found' });
    expect(await handler.handle(new GetGoalkeeperRegistrationAdminQuery('nobody'))).toEqual({ outcome: 'not_found' });
  });
});
