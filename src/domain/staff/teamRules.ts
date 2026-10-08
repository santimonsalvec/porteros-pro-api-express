import type { StaffActor } from './staffActor.js';
import type { StaffMember } from './staffMember.js';
import { OWNER_ROLE_ID } from './staffRole.js';

/**
 * Who may change whom in the team (spec 002, FR-007/FR-009). The owner role holds every
 * permission, present and future, so only an owner may touch an owner: anything else would let a
 * custom role escalate itself.
 */
export function canManageMember(actor: StaffActor, target: StaffMember): boolean {
  return target.roleId !== OWNER_ROLE_ID || actor.isOwner;
}

/** Giving or taking away the owner role is for owners only. */
export function canAssignRole(actor: StaffActor, fromRoleId: string, toRoleId: string): boolean {
  const touchesOwner = fromRoleId === OWNER_ROLE_ID || toRoleId === OWNER_ROLE_ID;
  return !touchesOwner || actor.isOwner;
}

/** Nobody disables themselves; an owner is disabled only by another owner. */
export function canDisable(actor: StaffActor, target: StaffMember): boolean {
  return actor.staffId !== target.id && canManageMember(actor, target);
}
