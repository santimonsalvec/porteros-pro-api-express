import { beforeEach, describe, expect, it } from 'vitest';
import { ListStaffRolesQuery } from '../../../../../src/application/features/staff/queries/listStaffRoles/listStaffRolesQuery.js';
import { ListStaffRolesQueryHandler } from '../../../../../src/application/features/staff/queries/listStaffRoles/listStaffRolesQueryHandler.js';
import { GetStaffRoleQuery } from '../../../../../src/application/features/staff/queries/getStaffRole/getStaffRoleQuery.js';
import { GetStaffRoleQueryHandler } from '../../../../../src/application/features/staff/queries/getStaffRole/getStaffRoleQueryHandler.js';
import { staffHarness } from './staffHarness.js';

describe('ListStaffRolesQueryHandler / GetStaffRoleQueryHandler', () => {
  let h: ReturnType<typeof staffHarness>;

  beforeEach(async () => {
    h = staffHarness();
    await h.role('soporte', ['cases.read']);
    await h.role('finanzas', ['wallets.read']);
    await h.activeMember('owner-1', 'dueno@example.com', 'owner', 'user-owner');
    await h.activeMember('staff-1', 'ana@example.com', 'soporte', 'user-1');
    await h.activeMember('staff-2', 'luis@example.com', 'soporte', 'user-2');
  });

  it('lists the owner first, then by name, with how many members each has', async () => {
    const result = await new ListStaffRolesQueryHandler({ members: h.members, roles: h.roles }).handle(new ListStaffRolesQuery(1, 20));

    expect(result).toMatchObject({ page: 1, totalItems: 3, totalPages: 1 });
    expect(result.items.map((role) => [role.id, role.memberCount])).toEqual([
      ['owner', 1],
      ['finanzas', 0],
      ['soporte', 2],
    ]);
    expect(result.items[0]).toMatchObject({ name: 'Dueño', system: true, permissions: [] });
  });

  it('reads one role, or says it does not exist', async () => {
    const get = new GetStaffRoleQueryHandler({ members: h.members, roles: h.roles });

    expect(await get.handle(new GetStaffRoleQuery('soporte'))).toMatchObject({ outcome: 'ok', role: { id: 'soporte', memberCount: 2, permissions: ['cases.read'] } });
    expect(await get.handle(new GetStaffRoleQuery('nope'))).toEqual({ outcome: 'role_not_found' });
  });
});
