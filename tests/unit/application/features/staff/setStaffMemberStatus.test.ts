import { beforeEach, describe, expect, it } from 'vitest';
import { SetStaffMemberStatusCommand } from '../../../../../src/application/features/staff/commands/setStaffMemberStatus/setStaffMemberStatusCommand.js';
import { SetStaffMemberStatusCommandHandler } from '../../../../../src/application/features/staff/commands/setStaffMemberStatus/setStaffMemberStatusCommandHandler.js';
import { AdminSession } from '../../../../../src/domain/staff/adminSession.js';
import { StaffMember } from '../../../../../src/domain/staff/staffMember.js';
import { DAY, staffHarness } from './staffHarness.js';
import { SCRIPT_ACTOR, type StaffActor } from '../../../../../src/domain/staff/staffActor.js';

describe('SetStaffMemberStatusCommandHandler', () => {
  let h: ReturnType<typeof staffHarness>;
  let handler: SetStaffMemberStatusCommandHandler;
  const set = (staffId: string, status: 'disabled' | 'active', actor: StaffActor = SCRIPT_ACTOR) =>
    handler.handle(new SetStaffMemberStatusCommand(staffId, status, actor));

  beforeEach(async () => {
    h = staffHarness();
    handler = new SetStaffMemberStatusCommandHandler({ members: h.members, sessions: h.sessions, clock: h.clock, accessResolver: h.resolver });
    await h.role('soporte', ['cases.read']);
    await h.activeMember('owner-1', 'dueno@example.com', 'owner', 'user-owner');
    await h.activeMember('staff-1', 'ana@example.com', 'soporte', 'user-1');
    for (const id of ['sid-a', 'sid-b']) {
      await h.sessions.add(AdminSession.start({ id, staffId: 'staff-1', userId: 'user-1', refreshTokenHash: `h-${id}`, userAgent: '', ip: '' }, h.clock.now()));
    }
  });

  it("disables a member, revoking every session of theirs at once", async () => {
    expect(await set('staff-1', 'disabled')).toMatchObject({ outcome: 'disabled' });

    expect((await h.members.getById('staff-1'))!.status).toBe('disabled');
    expect([...h.sessions.sessions.values()].map((session) => session.revokedReason)).toEqual(['staff_disabled', 'staff_disabled']);
    expect(h.invalidated).toEqual(['sid-a', 'sid-b']);
    expect(h.members.guardedSaves).toBe(1);
  });

  it('refuses to disable the last active owner', async () => {
    expect(await set('owner-1', 'disabled')).toEqual({ outcome: 'last_owner' });
    expect((await h.members.getById('owner-1'))!.status).toBe('active');
  });

  it('allows disabling an owner while another remains', async () => {
    await h.activeMember('owner-2', 'socio@example.com', 'owner', 'user-owner-2');

    expect(await set('owner-1', 'disabled')).toMatchObject({ outcome: 'disabled' });
  });

  it('enables a linked member back to active, and an unlinked one to a fresh invitation', async () => {
    await set('staff-1', 'disabled');
    await h.members.add(StaffMember.invite({ id: 'staff-2', email: 'luis@example.com', roleId: 'soporte', invitedBy: 'x' }, h.clock.now()).disable(h.clock.now()));
    h.clock.advance(10 * DAY);

    expect(await set('staff-1', 'active')).toMatchObject({ outcome: 'enabled' });
    expect(await set('staff-2', 'active')).toMatchObject({ outcome: 'enabled' });
    expect((await h.members.getById('staff-1'))!.status).toBe('active');
    expect((await h.members.getById('staff-2'))!.isInvitationValid(h.clock.now())).toBe(true);
  });

  it('reports an unknown member and a change that is not one', async () => {
    expect(await set('missing', 'disabled')).toEqual({ outcome: 'not_found' });
    expect(await set('staff-1', 'active')).toMatchObject({ outcome: 'unchanged' });
  });

  it('nobody disables themselves, and only an owner disables an owner', async () => {
    expect(await set('owner-1', 'disabled', { staffId: 'owner-1', isOwner: true })).toEqual({ outcome: 'cannot_disable_self' });
    expect(await set('owner-1', 'disabled', { staffId: 'staff-1', isOwner: false })).toEqual({ outcome: 'owner_requires_owner' });
    expect(await set('owner-1', 'active', { staffId: 'staff-1', isOwner: false })).toEqual({ outcome: 'owner_requires_owner' });
  });

  it('answers with the member as it is now', async () => {
    const result = await set('staff-1', 'disabled');

    expect(result).toMatchObject({ outcome: 'disabled', member: { id: 'staff-1', status: 'disabled' } });
  });

  it('disabling a member already disabled changes nothing', async () => {
    await set('staff-1', 'disabled');

    expect(await set('staff-1', 'disabled')).toMatchObject({ outcome: 'unchanged', member: { status: 'disabled' } });
  });
});
