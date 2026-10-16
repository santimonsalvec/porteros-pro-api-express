import { beforeEach, describe, expect, it } from 'vitest';
import { BlockUserCommand } from '../../../../../src/application/features/users/commands/blockUser/blockUserCommand.js';
import { BlockUserCommandHandler } from '../../../../../src/application/features/users/commands/blockUser/blockUserCommandHandler.js';
import { UnblockUserCommand } from '../../../../../src/application/features/users/commands/unblockUser/unblockUserCommand.js';
import { UnblockUserCommandHandler } from '../../../../../src/application/features/users/commands/unblockUser/unblockUserCommandHandler.js';
import { GetBlockImpactQuery } from '../../../../../src/application/features/users/queries/getBlockImpact/getBlockImpactQuery.js';
import { GetBlockImpactQueryHandler } from '../../../../../src/application/features/users/queries/getBlockImpact/getBlockImpactQueryHandler.js';
import { User } from '../../../../../src/domain/users/user.js';
import type { Market } from '../../../../../src/domain/markets/market.js';
import type { Zone } from '../../../../../src/domain/zones/zone.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { FakeUserBlockRepository } from '../../../../fakes/fakeUserBlockRepository.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { buildGoalkeeperProfile } from '../../../../fixtures/operatingBalanceFixtures.js';

const NOW = new Date('2026-10-12T15:00:00.000Z');
const LATER = new Date('2026-10-13T00:00:00.000Z');

describe('blocking a user (admin spec 005, US8)', () => {
  let users: FakeUserRepository;
  let blocks: FakeUserBlockRepository;
  let profiles: FakeGoalkeeperProfileRepository;
  let deps: ConstructorParameters<typeof BlockUserCommandHandler>[0] & ConstructorParameters<typeof GetBlockImpactQueryHandler>[0];

  beforeEach(() => {
    users = new FakeUserRepository();
    for (const id of ['keeper', 'client']) users.seed(User.createFromExternalIdentity({ id, email: `${id}@x.co`, displayName: null, provider: 'google', subject: id }));
    blocks = new FakeUserBlockRepository();
    profiles = new FakeGoalkeeperProfileRepository();
    profiles.seed(buildGoalkeeperProfile('keeper', { zoneIds: ['z1'] }));
    deps = {
      users,
      blocks,
      profiles,
      clock: { now: () => NOW },
      userReader: { openRequests: async () => ({ total: 1, items: [{ id: 'r1', startsAt: LATER, zoneId: 'z1' }] }) },
      goalkeeperReader: { upcomingBookings: async () => ({ total: 3, items: [{ id: 'b1', requestId: 'r9', startsAt: LATER, zoneId: 'gone' }] }) },
      zones: { getManyByIds: async (ids) => (ids.includes('z1') ? [{ id: 'z1', marketId: 'med' } as Zone] : []) },
      markets: { getByIds: async (ids) => (ids.includes('med') ? [{ id: 'med', name: 'Medellín', timeZone: 'America/Bogota' } as unknown as Market] : []) },
    };
  });

  it("blocks a goalkeeper and turns their offers off; repeating changes nothing", async () => {
    const handler = new BlockUserCommandHandler(deps);

    const result = await handler.handle(new BlockUserCommand('staff-1', 'keeper', '  Acoso a clientes '));

    expect(result).toEqual({
      outcome: 'blocked',
      result: { userId: 'keeper', blocked: true, blockedAt: NOW.toISOString(), unblockedAt: null, reason: 'Acoso a clientes', availableForOffers: false },
    });
    expect((await profiles.getByUserId('keeper'))!.availableForOffers).toBe(false);
    expect((await blocks.findByUserId('keeper'))).toMatchObject({ blocked: true, blockedBy: 'staff-1', blockReason: 'Acoso a clientes' });
    expect(await handler.handle(new BlockUserCommand('staff-2', 'keeper', 'Otra vez'))).toMatchObject({ outcome: 'replayed', result: { reason: 'Acoso a clientes' } });
  });

  it('blocks a client without touching any profile', async () => {
    expect(await new BlockUserCommandHandler(deps).handle(new BlockUserCommand('staff-1', 'client', 'Fraude'))).toMatchObject({
      outcome: 'blocked', result: { availableForOffers: null },
    });
  });

  it('unblocks without turning the offers back on', async () => {
    await new BlockUserCommandHandler(deps).handle(new BlockUserCommand('staff-1', 'keeper', 'Acoso'));
    const handler = new UnblockUserCommandHandler(deps);

    expect(await handler.handle(new UnblockUserCommand('staff-1', 'keeper', 'Revisado'))).toEqual({
      outcome: 'unblocked',
      result: { userId: 'keeper', blocked: false, blockedAt: NOW.toISOString(), unblockedAt: NOW.toISOString(), reason: 'Revisado', availableForOffers: false },
    });
    expect((await profiles.getByUserId('keeper'))!.availableForOffers).toBe(false);
    expect(await handler.handle(new UnblockUserCommand('staff-1', 'keeper', 'Otra vez'))).toMatchObject({ outcome: 'replayed' });
  });

  it('refuses a bad reason and an unknown user', async () => {
    const block = new BlockUserCommandHandler(deps);
    expect(await block.handle(new BlockUserCommand('staff-1', 'keeper', 'ab'))).toEqual({ outcome: 'validation_failed', fieldErrors: { reason: expect.any(String) } });
    expect(await block.handle(new BlockUserCommand('staff-1', 'nobody', 'Fraude'))).toEqual({ outcome: 'not_found' });
    expect(await new UnblockUserCommandHandler(deps).handle(new UnblockUserCommand('staff-1', 'nobody', 'Fraude'))).toEqual({ outcome: 'not_found' });
  });

  it("lists what the user has open, on each match's city clock", async () => {
    expect(await new GetBlockImpactQueryHandler(deps).handle(new GetBlockImpactQuery('keeper'))).toEqual({
      outcome: 'ok',
      impact: {
        isGoalkeeper: true,
        availableForOffers: true,
        openRequests: { total: 1, items: [{ id: 'r1', startsAt: LATER.toISOString(), marketName: 'Medellín', timeZone: 'America/Bogota' }] },
        upcomingBookings: { total: 3, items: [{ id: 'b1', requestId: 'r9', startsAt: LATER.toISOString(), marketName: null, timeZone: null }] },
      },
    });
    expect(await new GetBlockImpactQueryHandler(deps).handle(new GetBlockImpactQuery('client'))).toMatchObject({ impact: { isGoalkeeper: false, availableForOffers: null } });
    expect(await new GetBlockImpactQueryHandler(deps).handle(new GetBlockImpactQuery('nobody'))).toEqual({ outcome: 'not_found' });
  });
});
