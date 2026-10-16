import type { StaffScope } from '../../../../domain/staff/staffScope.js';
import type { StaffMember, StaffStatus } from '../../../../domain/staff/staffMember.js';
import type { StaffRole } from '../../../../domain/staff/staffRole.js';
import type { IStaffMemberRepository, IStaffRoleRepository } from './ports.js';

/** A team member as the admin web shows it (contracts/team-api.md). */
export interface StaffMemberView {
  staffId: string;
  email: string;
  displayName: string | null;
  role: { id: string; name: string; system: boolean };
  status: StaffStatus;
  invitationExpired: boolean;
  inviteExpiresAt: Date | null;
  lastSignInAt: Date | null;
  invitedBy: { staffId: string | null; label: string };
  createdAt: Date;
  /** Where the member may work (spec 031), each with its name (`null` for the platform or one gone). */
  scopes: StaffScopeView[];
}

export interface StaffScopeView {
  kind: StaffScope['kind'];
  id: string | null;
  name: string | null;
}

/** The names of the countries and markets the scopes name (spec 031). */
export interface ScopePlaces {
  markets: { getById(id: string): Promise<{ name: string } | null> };
  countries: { getById(id: string): Promise<{ name: string } | null> };
}

/** A role as the admin web shows it, with how many members have it. */
export interface StaffRoleView {
  id: string;
  name: string;
  description: string;
  system: boolean;
  permissions: readonly string[];
  memberCount: number;
  updatedAt: Date;
}

const SCRIPT_LABEL = 'Script de operación';

/** Members as views, resolving each role's name and who invited them, with few reads. */
export async function toStaffMemberViews(
  members: readonly StaffMember[],
  deps: { members: IStaffMemberRepository; roles: IStaffRoleRepository; places?: ScopePlaces },
  now: Date,
): Promise<StaffMemberView[]> {
  const names = new Map<string, string | null>();
  const nameOf = async (scope: StaffScope): Promise<string | null> => {
    if (scope.kind === 'platform' || !deps.places) return null;
    const key = `${scope.kind}:${scope.id}`;
    if (!names.has(key)) {
      const place = scope.kind === 'market' ? await deps.places.markets.getById(scope.id) : await deps.places.countries.getById(scope.id);
      names.set(key, place?.name ?? null);
    }
    return names.get(key)!;
  };
  const scopeViews = new Map<string, StaffScopeView[]>();
  for (const member of members) {
    scopeViews.set(
      member.id,
      await Promise.all(member.scopes.map(async (scope) => ({ kind: scope.kind, id: scope.kind === 'platform' ? null : scope.id, name: await nameOf(scope) }))),
    );
  }
  const roles = new Map<string, StaffRole | null>();
  const inviters = new Map<string, StaffMember | null>();
  for (const member of members) {
    if (!roles.has(member.roleId)) roles.set(member.roleId, await deps.roles.getById(member.roleId));
    if (!member.invitedBy.startsWith('system:') && !inviters.has(member.invitedBy)) {
      inviters.set(member.invitedBy, await deps.members.getById(member.invitedBy));
    }
  }
  return members.map((member) => {
    const role = roles.get(member.roleId);
    const inviter = inviters.get(member.invitedBy);
    return {
      staffId: member.id,
      email: member.email,
      displayName: member.displayName,
      role: { id: member.roleId, name: role?.name ?? member.roleId, system: role?.system ?? false },
      status: member.status,
      invitationExpired: member.status === 'invited' && !member.isInvitationValid(now),
      inviteExpiresAt: member.inviteExpiresAt,
      lastSignInAt: member.lastSignInAt,
      invitedBy: member.invitedBy.startsWith('system:')
        ? { staffId: null, label: SCRIPT_LABEL }
        : { staffId: member.invitedBy, label: inviter?.email ?? member.invitedBy },
      createdAt: member.createdAt,
      scopes: scopeViews.get(member.id) ?? [],
    };
  });
}

export function toStaffRoleView(role: StaffRole, memberCount: number): StaffRoleView {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    system: role.system,
    permissions: role.permissions,
    memberCount,
    updatedAt: role.updatedAt,
  };
}

/** The page metadata the existing admin lists use. */
export function pageOf<T>(items: T[], page: number, pageSize: number, totalItems: number) {
  return { items, page, pageSize, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)) };
}
