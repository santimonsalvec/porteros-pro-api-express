import type { IClock } from '../../../common/clock.js';
import type { IIdGenerator, IUserRepository } from '../../auth/common/ports.js';
import type { LoginCodeDependencies, LoginCodeLogEntry } from '../../auth/common/requestLoginCode.js';
import type { IAdminSecurityLog, IAdminSessionStore, IAdminTokenIssuer, IStaffMemberRepository } from './ports.js';
import type { IResponseTimer } from './responseFloor.js';

/** What the admin web's sign-in code needs (admin spec 009): the code's parts and the staff's. */
export interface AdminLoginCodeDependencies {
  /** The code's store, mailer, hash, limits and expiry; its log is replaced by the security log. */
  loginCodes: Omit<LoginCodeDependencies, 'log' | 'languageOfEmail'> & Partial<Pick<LoginCodeDependencies, 'log' | 'languageOfEmail'>>;
  members: IStaffMemberRepository;
  users: IUserRepository;
  sessions: IAdminSessionStore;
  tokens: IAdminTokenIssuer;
  ids: IIdGenerator;
  clock: IClock;
  securityLog: IAdminSecurityLog;
  timer: IResponseTimer;
  /** The floor of every code request's answer (research §7). */
  minResponseMs: number;
}

/**
 * The code's log entries in the admin web's security log, never with the code nor the full address;
 * the email's language is the member's linked user's (feature 032).
 */
export function adminLoginCodes(deps: AdminLoginCodeDependencies): LoginCodeDependencies {
  return {
    ...deps.loginCodes,
    clock: deps.clock,
    log: (entry: LoginCodeLogEntry) => deps.securityLog.log({ event: 'admin_email_code', outcome: entry.outcome, emailMasked: entry.emailMasked }),
    languageOfEmail: async (email) => {
      const member = await deps.members.findByEmail(email);
      const user = member?.userId ? await deps.users.getById(member.userId) : null;
      return user?.preferredLanguage ?? null;
    },
  };
}
