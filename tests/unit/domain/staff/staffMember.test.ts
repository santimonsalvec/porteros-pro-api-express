import { describe, expect, it } from 'vitest';
import { normalizeStaffEmail, StaffMember, StaffMemberTransitionError } from '../../../../src/domain/staff/staffMember.js';

const NOW = new Date('2026-10-08T14:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const at = (ms: number) => new Date(NOW.getTime() + ms);

const invite = () => StaffMember.invite({ id: 'staff-1', email: ' Ana@Example.COM ', roleId: 'soporte', invitedBy: 'system:script' }, NOW);

describe('normalizeStaffEmail', () => {
  it('trims and lower-cases a valid address', () => {
    expect(normalizeStaffEmail('  Ana@Example.COM ')).toBe('ana@example.com');
  });

  it('rejects anything that is not an email', () => {
    expect(normalizeStaffEmail('ana')).toBeNull();
    expect(normalizeStaffEmail('ana@')).toBeNull();
    expect(normalizeStaffEmail('a b@example.com')).toBeNull();
    expect(normalizeStaffEmail(`${'a'.repeat(250)}@example.com`)).toBeNull();
  });
});

describe('StaffMember', () => {
  it('an invitation lasts 7 days and has no account yet', () => {
    const member = invite();

    expect(member).toMatchObject({
      email: 'ana@example.com',
      status: 'invited',
      userId: null,
      roleIds: ['soporte'],
      invitedBy: 'system:script',
      invitedAt: NOW,
      inviteExpiresAt: at(7 * DAY),
      lastSignInAt: null,
    });
    expect(member.roleId).toBe('soporte');
    expect(member.isInvitationValid(at(7 * DAY - 1))).toBe(true);
    expect(member.isInvitationValid(at(7 * DAY))).toBe(false);
  });

  it('refuses an invalid email', () => {
    expect(() => StaffMember.invite({ id: 's', email: 'nope', roleId: 'soporte', invitedBy: 'x' }, NOW)).toThrow();
  });

  it('activates a valid invitation with the linked account', () => {
    const active = invite().activate('user-1', 'Ana', at(DAY));

    expect(active).toMatchObject({ status: 'active', userId: 'user-1', displayName: 'Ana', inviteExpiresAt: null, lastSignInAt: at(DAY) });
    expect(active.hasAccess()).toBe(true);
  });

  it('cannot activate an expired invitation, nor an active member', () => {
    expect(() => invite().activate('user-1', 'Ana', at(8 * DAY))).toThrow(StaffMemberTransitionError);
    expect(() => invite().activate('user-1', 'Ana', NOW).activate('user-1', 'Ana', NOW)).toThrow(StaffMemberTransitionError);
  });

  it('re-inviting renews the 7 days', () => {
    const renewed = invite().reinvite('finanzas', 'staff-9', at(8 * DAY));

    expect(renewed).toMatchObject({ status: 'invited', roleIds: ['finanzas'], invitedBy: 'staff-9', invitedAt: at(8 * DAY), inviteExpiresAt: at(15 * DAY) });
  });

  it('disables an active member or a pending invitation, and nothing else', () => {
    const active = invite().activate('user-1', 'Ana', NOW);

    expect(active.disable(at(DAY))).toMatchObject({ status: 'disabled', updatedAt: at(DAY) });
    expect(active.disable(at(DAY)).hasAccess()).toBe(false);
    expect(invite().disable(NOW).status).toBe('disabled');
    expect(() => active.disable(NOW).disable(NOW)).toThrow(StaffMemberTransitionError);
  });

  it('enabling returns a linked member to active and an unlinked one to a fresh invitation', () => {
    const linked = invite().activate('user-1', 'Ana', NOW).disable(NOW).enable(at(DAY));
    const unlinked = invite().disable(NOW).enable(at(10 * DAY));

    expect(linked).toMatchObject({ status: 'active', userId: 'user-1' });
    expect(unlinked).toMatchObject({ status: 'invited', inviteExpiresAt: at(17 * DAY) });
    expect(() => invite().enable(NOW)).toThrow(StaffMemberTransitionError);
  });

  it('records sign-ins and role changes', () => {
    const active = invite().activate('user-1', 'Ana', NOW);

    expect(active.recordSignIn(at(DAY)).lastSignInAt).toEqual(at(DAY));
    expect(active.changeRole('owner', at(DAY)).roleIds).toEqual(['owner']);
  });
});
