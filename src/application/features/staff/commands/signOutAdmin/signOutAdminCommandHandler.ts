import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IAdminSecurityLog, IAdminSessionStore, IAdminTokenIssuer, IStaffAccessResolver } from '../../common/ports.js';
import { SignOutAdminCommand, type SignOutAdminResult } from './signOutAdminCommand.js';

export interface SignOutAdminDependencies {
  sessions: IAdminSessionStore;
  tokens: IAdminTokenIssuer;
  clock: IClock;
  securityLog: IAdminSecurityLog;
  accessResolver: IStaffAccessResolver;
}

/** Revokes the session behind the cookie, if any; signing out always succeeds (spec 001, FR-014). */
export class SignOutAdminCommandHandler implements ICommandHandler<SignOutAdminCommand, SignOutAdminResult> {
  constructor(private readonly deps: SignOutAdminDependencies) {}

  async handle(command: SignOutAdminCommand): Promise<SignOutAdminResult> {
    if (!command.refreshToken) return { outcome: 'signed_out' };
    const session = await this.deps.sessions.findByRefreshHash(this.deps.tokens.hashRefreshToken(command.refreshToken));
    if (!session || session.revokedAt) return { outcome: 'signed_out' };

    await this.deps.sessions.update(session.revoke('sign_out', this.deps.clock.now()));
    this.deps.accessResolver.invalidate(session.id);
    this.deps.securityLog.log({ event: 'admin_sign_out', outcome: 'signed_out', staffId: session.staffId, sessionId: session.id });
    return { outcome: 'signed_out' };
  }
}
