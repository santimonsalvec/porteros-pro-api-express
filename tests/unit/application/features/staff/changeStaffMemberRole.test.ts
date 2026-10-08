import { beforeEach, describe, expect, it } from 'vitest';
import { ChangeStaffMemberRoleCommand } from '../../../../../src/application/features/staff/commands/changeStaffMemberRole/changeStaffMemberRoleCommand.js';
import { ChangeStaffMemberRoleCommandHandler } from '../../../../../src/application/features/staff/commands/changeStaffMemberRole/changeStaffMemberRoleCommandHandler.js';
import { SCRIPT_ACTOR, type StaffActor } from '../../../../../src/domain/staff/staffActor.js';
import { staffHarness } from './staffHarness.js';

describe('ChangeStaffMemberRoleCommandHandler', () => {
  let h: ReturnType<typeof staffHarness>;
  let handler: ChangeStaffMemberRoleCommandHandler;
  const change = (staffId: string, roleId: string, actor: StaffActor = SCRIPT_ACTOR) =>
    handler.handle(new ChangeStaffMemberRoleCommand(staffId, roleId, actor));
  const manager = { staffId: 'staff-1', isOwner: false };

  beforeEach(async () => {
    h = staffHarness();
    handler = new ChangeStaffMemberRoleCommandHandler({ members: h.members, roles: h.roles, clock: h.clock, accessResolver: h.resolver });
    await h.role('soporte', ['cases.read']);
    await h.role('finanzas', ['wallets.read']);
    await h.activeMember('owner-1', 'dueno@example.com', 'owner', 'user-owner');
    await h.activeMember('staff-1', 'ana@example.com', 'soporte', 'user-1');
  });

  it('changes the role and forgets the cached access', async () => {
    expect(await change('staff-1', 'finanzas', manager)).toMatchObject({ outcome: 'changed', member: { roleIds: ['finanzas'] } });
    expect(h.invalidated).toContain(undefined);
  });

  it('the same role is no change', async () => {
    expect(await change('staff-1', 'soporte')).toMatchObject({ outcome: 'unchanged' });
  });

  it('reports a missing member or role', async () => {
    expect(await change('nope', 'soporte')).toEqual({ outcome: 'staff_not_found' });
    expect(await change('staff-1', 'nope')).toEqual({ outcome: 'role_not_found' });
  });

  it('only an owner gives or takes away the owner role, or changes an owner', async () => {
    expect(await change('staff-1', 'owner', manager)).toEqual({ outcome: 'owner_requires_owner' });
    expect(await change('owner-1', 'soporte', manager)).toEqual({ outcome: 'owner_requires_owner' });
  });

  it('never leaves the team without an active owner', async () => {
    expect(await change('owner-1', 'soporte', { staffId: 'owner-1', isOwner: true })).toEqual({ outcome: 'last_owner' });
    expect((await h.members.getById('owner-1'))!.roleIds).toEqual(['owner']);
  });
});
