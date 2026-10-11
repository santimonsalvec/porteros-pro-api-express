import { beforeEach, describe, expect, it } from 'vitest';
import { InviteStaffMemberCommand } from '../../../../../src/application/features/staff/commands/inviteStaffMember/inviteStaffMemberCommand.js';
import { InviteStaffMemberCommandHandler } from '../../../../../src/application/features/staff/commands/inviteStaffMember/inviteStaffMemberCommandHandler.js';
import { DAY, staffHarness } from './staffHarness.js';
import { SCRIPT_ACTOR } from '../../../../../src/domain/staff/staffActor.js';

describe('InviteStaffMemberCommandHandler', () => {
  let h: ReturnType<typeof staffHarness>;
  let handler: InviteStaffMemberCommandHandler;
  const invite = (email: string, roleId: string, actor = SCRIPT_ACTOR) => handler.handle(new InviteStaffMemberCommand(email, roleId, actor));

  beforeEach(async () => {
    h = staffHarness();
    handler = new InviteStaffMemberCommandHandler({ members: h.members, roles: h.roles, ids: h.ids, clock: h.clock });
    await h.roles.ensureOwner(h.clock.now());
    await h.role('soporte', ['cases.read']);
  });

  it('invites an email for 7 days with its role', async () => {
    expect(await invite(' Ana@Example.com ', 'soporte')).toEqual({ outcome: 'invited', staffId: 'id-1' });

    const member = await h.members.findByEmail('ana@example.com');
    expect(member).toMatchObject({ status: 'invited', roleIds: ['soporte'], invitedBy: 'system:script' });
    expect(member!.inviteExpiresAt).toEqual(new Date(h.clock.now().getTime() + 7 * DAY));
  });

  it('inviting a pending email again renews its 7 days', async () => {
    await invite('ana@example.com', 'soporte');
    h.clock.advance(8 * DAY);

    expect(await invite('ana@example.com', 'soporte')).toEqual({ outcome: 'reinvited', staffId: 'id-1' });
    expect((await h.members.findByEmail('ana@example.com'))!.isInvitationValid(h.clock.now())).toBe(true);
  });

  it('refuses an active member, an unknown role and an invalid email', async () => {
    await h.activeMember('staff-9', 'luis@example.com', 'soporte', 'user-9');

    expect(await invite('luis@example.com', 'soporte')).toEqual({ outcome: 'already_member' });
    expect(await invite('ana@example.com', 'nope')).toEqual({ outcome: 'role_not_found' });
    expect(await invite('ana', 'soporte')).toEqual({ outcome: 'invalid_email' });
  });

  it('only an owner, or a script, invites another owner', async () => {
    expect(await invite('socio@example.com', 'owner', { staffId: 'staff-1', isOwner: false })).toEqual({ outcome: 'owner_requires_owner' });
    expect(await invite('socio@example.com', 'owner', { staffId: 'staff-2', isOwner: true })).toEqual({ outcome: 'invited', staffId: 'id-1' });
    expect((await h.members.findByEmail('socio@example.com'))!.invitedBy).toBe('staff-2');
  });

  it('renews an expired invitation, whoever sends it again', async () => {
    await invite('ana@example.com', 'soporte');
    h.clock.advance(8 * DAY);

    expect(await invite('ana@example.com', 'soporte', { staffId: 'staff-9', isOwner: false })).toEqual({ outcome: 'reinvited', staffId: 'id-1' });
    expect(await h.members.findByEmail('ana@example.com')).toMatchObject({ invitedBy: 'staff-9' });
  });

  it('a non-owner cannot renew an invitation to the owner role', async () => {
    await invite('socio@example.com', 'owner');

    expect(await invite('socio@example.com', 'owner', { staffId: 'staff-1', isOwner: false })).toEqual({ outcome: 'owner_requires_owner' });
  });
});

