import request from 'supertest';
import type { buildTestApp } from './testAppFactory.js';
import { ExternalIdentity } from '../../src/domain/users/externalIdentity.js';
import { User } from '../../src/domain/users/user.js';
import { StaffMember } from '../../src/domain/staff/staffMember.js';
import { OWNER_ROLE_ID, StaffRole } from '../../src/domain/staff/staffRole.js';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

/** The CSRF header the admin web sends on `/auth/admin/refresh` and `/sign-out`. */
export const CSRF = { 'X-Requested-With': 'porteros-admin' };

export interface SignedInStaff {
  token: string;
  /** The `pp_admin_rt=…` pair to send back as a `Cookie` header. */
  cookie: string;
  staffId: string;
  userId: string;
}

/** The `pp_admin_rt=value` pair of a response's `Set-Cookie`, or null. */
export function refreshCookieOf(response: request.Response): string | null {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('pp_admin_rt='));
  return cookie ? cookie.split(';')[0]! : null;
}

/** A custom role with exactly these permissions. */
export async function seedRole(context: TestApp, id: string, permissions: string[]): Promise<void> {
  await context.staffRoleRepository.upsert(StaffRole.create({ id, name: id, description: '', permissions }, context.clock.now()));
}

/**
 * An active staff member (with role `roleId`, `owner` by default) whose Google account already
 * exists, signed in through `POST /auth/admin/sign-in`.
 */
export async function signInStaff(
  context: TestApp,
  options: { key: string; roleId?: string; userId?: string },
): Promise<SignedInStaff> {
  const { key } = options;
  const roleId = options.roleId ?? OWNER_ROLE_ID;
  const userId = options.userId ?? `user-${key}`;
  const email = `${key}@porteros.pro`;
  const now = context.clock.now();
  await context.staffRoleRepository.ensureOwner(now);
  if (!(await context.userRepository.getById(userId))) {
    await context.userRepository.add(User.createFromExternalIdentity({ id: userId, email, displayName: null, provider: 'google', subject: `sub-${key}` }));
  }
  const member = StaffMember.invite({ id: `staff-${key}`, email, roleId, invitedBy: 'system:script' }, now).activate(userId, key, now);
  await context.staffMemberRepository.add(member);
  context.googleValidator.registerValidAdminCredential(`admin-cred-${key}`, new ExternalIdentity('google', `sub-${key}`, email), true, key);

  const response = await request(context.app).post('/auth/admin/sign-in').send({ credential: `admin-cred-${key}` });
  if (response.status !== 200) throw new Error(`Staff sign-in failed: ${response.status} ${JSON.stringify(response.body)}`);
  return { token: response.body.accessToken as string, cookie: refreshCookieOf(response)!, staffId: member.id, userId };
}
