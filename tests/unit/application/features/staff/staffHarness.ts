import { ExternalIdentity } from '../../../../../src/domain/users/externalIdentity.js';
import { User } from '../../../../../src/domain/users/user.js';
import { StaffMember } from '../../../../../src/domain/staff/staffMember.js';
import { StaffRole } from '../../../../../src/domain/staff/staffRole.js';
import { FakeAdminSessionStore } from '../../../../fakes/fakeAdminSessionStore.js';
import { FakeAdminTokenIssuer } from '../../../../fakes/fakeAdminTokenIssuer.js';
import { FakeAdminSecurityLog } from '../../../../fakes/fakeAdminSecurityLog.js';
import { FakeGoogleIdTokenValidator } from '../../../../fakes/fakeGoogleIdTokenValidator.js';
import { FakeStaffMemberRepository } from '../../../../fakes/fakeStaffMemberRepository.js';
import { FakeStaffRoleRepository } from '../../../../fakes/fakeStaffRoleRepository.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { FakeAdminAuditLog } from '../../../../fakes/fakeAdminAuditLog.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';

export const NOW = '2026-10-08T14:00:00.000Z';
export const MINUTE = 60 * 1000;
export const DAY = 24 * 60 * MINUTE;

/** Fakes shared by the staff handlers' unit tests, plus seeding helpers. */
export function staffHarness() {
  let counter = 0;
  const members = new FakeStaffMemberRepository();
  const h = {
    clock: new FixedClock(NOW),
    google: new FakeGoogleIdTokenValidator(),
    users: new FakeUserRepository(),
    members,
    roles: new FakeStaffRoleRepository(members),
    sessions: new FakeAdminSessionStore(),
    tokens: new FakeAdminTokenIssuer(),
    securityLog: new FakeAdminSecurityLog(),
    auditLog: new FakeAdminAuditLog(),
    ids: { newId: () => `id-${++counter}` },
    invalidated: [] as (string | undefined)[],
    resolver: {
      resolve: async () => null,
      invalidate: (sessionId?: string) => {
        h.invalidated.push(sessionId);
      },
    },
    /** A Google account that already used the app (a `User` linked to the identity). */
    async account(id: string, email: string, sub = `sub-${id}`) {
      const user = User.createFromExternalIdentity({ id, email, displayName: null, provider: 'google', subject: sub });
      await h.users.add(user);
      return user;
    },
    /** Registers `credential` as a verified Google sign-in of that identity for the admin web. */
    credential(credential: string, email: string, sub: string, emailVerified = true, displayName: string | null = 'Ana') {
      h.google.registerValidAdminCredential(credential, new ExternalIdentity('google', sub, email), emailVerified, displayName);
    },
    async role(id: string, permissions: string[]) {
      const role = StaffRole.create({ id, name: id, description: '', permissions }, h.clock.now());
      await h.roles.upsert(role);
      return role;
    },
    /** An active member linked to a user with Google subject `sub-<userId>`. */
    async activeMember(staffId: string, email: string, roleId: string, userId: string) {
      await h.roles.ensureOwner(h.clock.now());
      const member = StaffMember.invite({ id: staffId, email, roleId, invitedBy: 'system:script' }, h.clock.now()).activate(userId, 'Ana', h.clock.now());
      await h.members.add(member);
      return member;
    },
  };
  return h;
}
