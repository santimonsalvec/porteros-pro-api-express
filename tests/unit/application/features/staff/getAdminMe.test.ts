import { beforeEach, describe, expect, it } from 'vitest';
import { GetAdminMeQuery } from '../../../../../src/application/features/staff/queries/getAdminMe/getAdminMeQuery.js';
import { GetAdminMeQueryHandler } from '../../../../../src/application/features/staff/queries/getAdminMe/getAdminMeQueryHandler.js';
import { AdminSession } from '../../../../../src/domain/staff/adminSession.js';
import { PERMISSION_CATALOG } from '../../../../../src/domain/staff/permissionCatalog.js';
import { staffHarness } from './staffHarness.js';

describe('GetAdminMeQueryHandler', () => {
  let h: ReturnType<typeof staffHarness>;
  let handler: GetAdminMeQueryHandler;

  beforeEach(async () => {
    h = staffHarness();
    handler = new GetAdminMeQueryHandler({ members: h.members, roles: h.roles, sessions: h.sessions });
    await h.sessions.add(AdminSession.start({ id: 'sid-1', staffId: 'staff-1', userId: 'user-1', refreshTokenHash: 'h', userAgent: '', ip: '' }, h.clock.now()));
  });

  it("returns the owner with the whole catalog and the session's limits", async () => {
    await h.activeMember('staff-1', 'dueno@example.com', 'owner', 'user-1');

    expect(await handler.handle(new GetAdminMeQuery('staff-1', 'sid-1'))).toEqual({
      outcome: 'ok',
      me: {
        staffId: 'staff-1',
        userId: 'user-1',
        email: 'dueno@example.com',
        displayName: 'Ana',
        role: { id: 'owner', name: 'Dueño', system: true },
        permissions: [...PERMISSION_CATALOG],
        session: { startedAt: h.clock.now(), absoluteExpiresAt: new Date(h.clock.now().getTime() + 12 * 60 * 60 * 1000) },
      },
    });
  });

  it("returns a custom role's own permissions", async () => {
    await h.role('soporte', ['cases.resolve', 'cases.read']);
    await h.activeMember('staff-1', 'ana@example.com', 'soporte', 'user-1');

    const result = await handler.handle(new GetAdminMeQuery('staff-1', 'sid-1'));

    expect(result).toMatchObject({ outcome: 'ok', me: { role: { id: 'soporte', system: false }, permissions: ['cases.read', 'cases.resolve'] } });
  });

  it('is not_found without the member or the session', async () => {
    expect(await handler.handle(new GetAdminMeQuery('missing', 'sid-1'))).toEqual({ outcome: 'not_found' });
  });
});
