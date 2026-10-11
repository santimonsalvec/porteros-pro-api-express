import { describe, expect, it } from 'vitest';
import { SCRIPT_ACTOR } from '../../../../src/domain/staff/staffActor.js';
import { canAssignRole, canDisable, canManageMember } from '../../../../src/domain/staff/teamRules.js';
import { StaffMember } from '../../../../src/domain/staff/staffMember.js';

const NOW = new Date('2026-10-08T14:00:00.000Z');
const member = (id: string, roleId: string) =>
  StaffMember.invite({ id, email: `${id}@example.com`, roleId, invitedBy: 'x' }, NOW).activate(`user-${id}`, id, NOW);

const owner = { staffId: 'owner-1', isOwner: true };
const manager = { staffId: 'manager-1', isOwner: false };

describe('team rules', () => {
  it('only an owner manages an owner; anyone with the permission manages the rest', () => {
    expect(canManageMember(manager, member('owner-2', 'owner'))).toBe(false);
    expect(canManageMember(owner, member('owner-2', 'owner'))).toBe(true);
    expect(canManageMember(manager, member('ana', 'soporte'))).toBe(true);
  });

  it('only an owner gives or takes away the owner role', () => {
    expect(canAssignRole(manager, 'soporte', 'owner')).toBe(false);
    expect(canAssignRole(manager, 'owner', 'soporte')).toBe(false);
    expect(canAssignRole(manager, 'soporte', 'finanzas')).toBe(true);
    expect(canAssignRole(owner, 'soporte', 'owner')).toBe(true);
  });

  it('nobody disables themselves, and only an owner disables an owner', () => {
    expect(canDisable(owner, member('owner-1', 'owner'))).toBe(false);
    expect(canDisable(manager, member('owner-2', 'owner'))).toBe(false);
    expect(canDisable(owner, member('owner-2', 'owner'))).toBe(true);
    expect(canDisable(manager, member('ana', 'soporte'))).toBe(true);
  });

  it('an operations script acts as an owner', () => {
    expect(SCRIPT_ACTOR).toEqual({ staffId: 'system:script', isOwner: true });
    expect(canDisable(SCRIPT_ACTOR, member('owner-2', 'owner'))).toBe(true);
    expect(canAssignRole(SCRIPT_ACTOR, 'soporte', 'owner')).toBe(true);
  });
});
