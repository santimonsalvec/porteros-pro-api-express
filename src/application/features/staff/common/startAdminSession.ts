import type { IClock } from '../../../common/clock.js';
import type { IIdGenerator } from '../../auth/common/ports.js';
import { AdminSession } from '../../../../domain/staff/adminSession.js';
import type { StaffMember } from '../../../../domain/staff/staffMember.js';
import type { IAdminSecurityLog, IAdminSessionStore, IAdminTokenIssuer, IStaffMemberRepository } from './ports.js';
import { toSessionSummary, type IssuedAdminSession } from './sessionResponse.js';

export interface AdminSessionDependencies {
  members: Pick<IStaffMemberRepository, 'update'>;
  sessions: Pick<IAdminSessionStore, 'add'>;
  tokens: IAdminTokenIssuer;
  ids: IIdGenerator;
  clock: IClock;
  securityLog: IAdminSecurityLog;
}

/**
 * Opens an admin web session for a member who just proved who they are, with Google or with a
 * sign-in code (admin spec 009, research §8): the last sign-in, the session with its 12 h limit,
 * the access token and the security log. One place, so both ways of signing in end the same.
 */
export async function startAdminSession(
  deps: AdminSessionDependencies,
  member: StaffMember,
  context: { userAgent: string; ip: string; method: 'google' | 'email_code' },
): Promise<IssuedAdminSession> {
  const now = deps.clock.now();
  await deps.members.update(member.recordSignIn(now));
  const refreshToken = deps.tokens.newRefreshToken();
  const session = AdminSession.start(
    {
      id: deps.ids.newId(),
      staffId: member.id,
      userId: member.userId!,
      refreshTokenHash: deps.tokens.hashRefreshToken(refreshToken),
      userAgent: context.userAgent,
      ip: context.ip,
    },
    now,
  );
  await deps.sessions.add(session);
  const access = await deps.tokens.issueAccessToken({ userId: session.userId, sessionId: session.id, staffId: member.id });

  // Only a code names its method: a sign-in event without one is Google's, as it always was.
  deps.securityLog.log({
    event: 'admin_sign_in',
    outcome: 'signed_in',
    staffId: member.id,
    sessionId: session.id,
    ...(context.method === 'email_code' ? { method: 'email_code' as const } : {}),
  });
  return { ...access, refreshToken, session: toSessionSummary(session) };
}
