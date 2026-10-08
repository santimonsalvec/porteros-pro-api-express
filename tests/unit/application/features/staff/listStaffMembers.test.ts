import { beforeEach, describe, expect, it } from 'vitest';
import { ListStaffMembersQuery } from '../../../../../src/application/features/staff/queries/listStaffMembers/listStaffMembersQuery.js';
import { ListStaffMembersQueryHandler } from '../../../../../src/application/features/staff/queries/listStaffMembers/listStaffMembersQueryHandler.js';
import { GetStaffMemberQuery } from '../../../../../src/application/features/staff/queries/getStaffMember/getStaffMemberQuery.js';
import { GetStaffMemberQueryHandler } from '../../../../../src/application/features/staff/queries/getStaffMember/getStaffMemberQueryHandler.js';
import { StaffMember } from '../../../../../src/domain/staff/staffMember.js';
import { DAY, staffHarness } from './staffHarness.js';

describe('ListStaffMembersQueryHandler / GetStaffMemberQueryHandler', () => {
  let h: ReturnType<typeof staffHarness>;
  let list: ListStaffMembersQueryHandler;
  let get: GetStaffMemberQueryHandler;

  beforeEach(async () => {
    h = staffHarness();
    list = new ListStaffMembersQueryHandler({ members: h.members, roles: h.roles, clock: h.clock });
    get = new GetStaffMemberQueryHandler({ members: h.members, roles: h.roles, clock: h.clock });
    await h.role('soporte', ['cases.read']);
    await h.activeMember('owner-1', 'dueno@example.com', 'owner', 'user-owner');
    await h.members.add(StaffMember.invite({ id: 'staff-2', email: 'ana@example.com', roleId: 'soporte', invitedBy: 'owner-1' }, h.clock.now()));
    await h.members.add(StaffMember.invite({ id: 'staff-3', email: 'luis@example.com', roleId: 'soporte', invitedBy: 'system:script' }, h.clock.now()));
  });

  it('lists members by email with role names, invitation state and who invited them', async () => {
    h.clock.advance(8 * DAY);

    const result = await list.handle(new ListStaffMembersQuery({}, 1, 20));

    expect(result).toMatchObject({ page: 1, pageSize: 20, totalItems: 3, totalPages: 1 });
    expect(result.items.map((item) => item.email)).toEqual(['ana@example.com', 'dueno@example.com', 'luis@example.com']);
    expect(result.items[0]).toMatchObject({
      staffId: 'staff-2',
      role: { id: 'soporte', name: 'soporte', system: false },
      status: 'invited',
      invitationExpired: true,
      lastSignInAt: null,
      invitedBy: { staffId: 'owner-1', label: 'dueno@example.com' },
    });
    expect(result.items[1]).toMatchObject({ role: { id: 'owner', name: 'Dueño', system: true }, status: 'active', invitationExpired: false });
    expect(result.items[2]!.invitedBy).toEqual({ staffId: null, label: 'Script de operación' });
  });

  it('passes the filters and the page through', async () => {
    const result = await list.handle(new ListStaffMembersQuery({ status: 'invited', roleId: 'soporte', q: 'lu' }, 1, 1));

    expect(result.items.map((item) => item.email)).toEqual(['luis@example.com']);
    expect(result).toMatchObject({ totalItems: 1, totalPages: 1 });
  });

  it('reads one member, or says it does not exist', async () => {
    expect(await get.handle(new GetStaffMemberQuery('staff-2'))).toMatchObject({ outcome: 'ok', member: { email: 'ana@example.com' } });
    expect(await get.handle(new GetStaffMemberQuery('missing'))).toEqual({ outcome: 'staff_not_found' });
  });

  it('shows the role id when the role is gone, and the inviter id when the inviter is gone', async () => {
    await h.members.add(StaffMember.invite({ id: 'staff-4', email: 'zoe@example.com', roleId: 'retirado', invitedBy: 'staff-gone' }, h.clock.now()));

    const result = await list.handle(new ListStaffMembersQuery({}, 1, 20));

    expect(result.items.at(-1)).toMatchObject({
      role: { id: 'retirado', name: 'retirado', system: false },
      invitedBy: { staffId: 'staff-gone', label: 'staff-gone' },
    });
  });
});
