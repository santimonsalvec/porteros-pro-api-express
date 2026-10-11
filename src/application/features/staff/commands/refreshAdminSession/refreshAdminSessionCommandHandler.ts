import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type {
  IAdminSecurityLog,
  IAdminSessionStore,
  IAdminTokenIssuer,
  IStaffAccessResolver,
  IStaffMemberRepository,
} from '../../common/ports.js';
import { toSessionSummary } from '../../common/sessionResponse.js';
import { RefreshAdminSessionCommand, type RefreshAdminSessionResult } from './refreshAdminSessionCommand.js';

export interface RefreshAdminSessionDependencies {
  members: IStaffMemberRepository;
  sessions: IAdminSessionStore;
  tokens: IAdminTokenIssuer;
  clock: IClock;
  securityLog: IAdminSecurityLog;
  accessResolver: IStaffAccessResolver;
}

const INVALID = { outcome: 'invalid_refresh_token' } as const;

/**
 * Single-use rotation of an admin session's refresh value. The 12-hour and 30-minute limits are
 * the session's; a member who lost access cannot refresh. The previous value coming back means it
 * was copied, so the whole session is revoked. Every refusal is the same `invalid_refresh_token`.
 */
export class RefreshAdminSessionCommandHandler implements ICommandHandler<RefreshAdminSessionCommand, RefreshAdminSessionResult> {
  constructor(private readonly deps: RefreshAdminSessionDependencies) {}

  async handle(command: RefreshAdminSessionCommand): Promise<RefreshAdminSessionResult> {
    const now = this.deps.clock.now();
    const hash = this.deps.tokens.hashRefreshToken(command.refreshToken);
    const session = await this.deps.sessions.findByRefreshHash(hash);
    if (!session) {
      await this.revokeIfReused(hash, now);
      return INVALID;
    }

    const member = await this.deps.members.getById(session.staffId);
    if (!session.isValid(now) || !member?.hasAccess()) {
      this.deps.securityLog.log({ event: 'admin_refresh', outcome: 'expired', staffId: session.staffId, sessionId: session.id });
      return INVALID;
    }

    const refreshToken = this.deps.tokens.newRefreshToken();
    const rotated = session.rotate(this.deps.tokens.hashRefreshToken(refreshToken), now);
    if (!(await this.deps.sessions.replaceIfCurrent(rotated, hash))) {
      // Another refresh with the same value won the race: that value is now a reused one.
      await this.revokeIfReused(hash, now);
      return INVALID;
    }
    const access = await this.deps.tokens.issueAccessToken({ userId: session.userId, sessionId: session.id, staffId: session.staffId });

    this.deps.securityLog.log({ event: 'admin_refresh', outcome: 'refreshed', staffId: session.staffId, sessionId: session.id });
    return { outcome: 'refreshed', ...access, refreshToken, session: toSessionSummary(rotated) };
  }

  private async revokeIfReused(hash: string, now: Date): Promise<void> {
    const reused = await this.deps.sessions.findByPreviousRefreshHash(hash);
    if (!reused || reused.revokedAt) return;
    await this.deps.sessions.update(reused.revoke('refresh_reuse', now));
    this.deps.accessResolver.invalidate(reused.id);
    this.deps.securityLog.log({ event: 'admin_refresh', outcome: 'refresh_reuse', staffId: reused.staffId, sessionId: reused.id });
  }
}
