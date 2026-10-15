import type { ICommandHandler } from '../../../../common/mediator/types.js';
import {
  EmailKeyTakenError,
  type AppGoogleIdentity,
  type IAuditLogger,
  type IGoogleIdTokenValidator,
  type IIdGenerator,
  type IInternalTokenIssuer,
  type IRefreshTokenRepository,
  type IUserRepository,
} from '../../common/ports.js';
import type { IGoalkeeperProfileRepository } from '../../../goalkeepers/common/ports.js';
import { normalizeEmail } from '../../../../../domain/common/email.js';
import { ExternalIdentity } from '../../../../../domain/users/externalIdentity.js';
import { User } from '../../../../../domain/users/user.js';
import { NO_BLOCKED_USERS, type BlockedUsers } from '../../../users/common/blockedUsers.js';
import type { ClosedAccounts } from '../../../accountClosures/common/closedAccounts.js';
import { issueAppSession } from '../../common/issueAppSession.js';
import { ExchangeSsoCredentialCommand, type ExchangeSsoCredentialResult } from './exchangeSsoCredentialCommand.js';

const REFRESH_TOKEN_LIFETIME_MS_DEFAULT = 1000 * 60 * 60 * 24 * 30;

export class ExchangeSsoCredentialCommandHandler
  implements ICommandHandler<ExchangeSsoCredentialCommand, ExchangeSsoCredentialResult>
{
  constructor(
    private readonly googleValidator: IGoogleIdTokenValidator,
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    private readonly tokenIssuer: IInternalTokenIssuer,
    private readonly goalkeeperProfileRepository: IGoalkeeperProfileRepository,
    private readonly idGenerator: IIdGenerator,
    private readonly auditLogger: IAuditLogger,
    private readonly refreshTokenLifetimeMs: number = REFRESH_TOKEN_LIFETIME_MS_DEFAULT,
    private readonly blockedUsers: BlockedUsers = NO_BLOCKED_USERS,
    private readonly closedAccounts?: ClosedAccounts,
  ) {}

  async handle(command: ExchangeSsoCredentialCommand): Promise<ExchangeSsoCredentialResult> {
    // The admin web has its own sessions (staff members, porteros-pro-admin spec 001): this
    // exchange is only the app's, and `users.isAdmin` no longer grants anything.
    if (command.platform === 'admin-web') {
      this.auditLogger.logSsoAttempt({ provider: command.provider, platform: command.platform, success: false, reason: 'admin_sign_in_moved' });
      return { outcome: 'admin_sign_in_moved' };
    }

    const identity = await this.googleValidator.validate(command.credential, command.platform);
    if (!identity) {
      this.auditLogger.logSsoAttempt({
        provider: command.provider,
        platform: command.platform,
        success: false,
        reason: 'invalid_credential',
      });
      return { outcome: 'invalid_credential' };
    }

    const user = (await this.userRepository.findByExternalIdentity(identity.provider, identity.subject)) ?? (await this.accountFor(identity));

    const session = await issueAppSession(
      {
        refreshTokenRepository: this.refreshTokenRepository,
        tokenIssuer: this.tokenIssuer,
        goalkeeperProfileRepository: this.goalkeeperProfileRepository,
        idGenerator: this.idGenerator,
        refreshTokenLifetimeMs: this.refreshTokenLifetimeMs,
        blockedUsers: this.blockedUsers,
        closedAccounts: this.closedAccounts,
      },
      user,
    );
    if (session.outcome === 'account_blocked') {
      this.auditLogger.logSsoAttempt({ provider: command.provider, platform: command.platform, success: false, reason: 'account_blocked' });
      return { outcome: 'account_blocked' };
    }

    this.auditLogger.logSsoAttempt({ provider: command.provider, platform: command.platform, success: true });
    return { outcome: 'success', tokens: session.tokens };
  }

  /**
   * A first Google sign-in: the account a sign-in code made for this verified address, now linked
   * to the identity (admin spec 009, Q1), or a new one. An unverified address never finds an account.
   */
  private async accountFor(identity: AppGoogleIdentity): Promise<User> {
    const linked = new ExternalIdentity(identity.provider, identity.subject, identity.email);
    const emailKey = identity.emailVerified ? normalizeEmail(identity.email) : null;
    const existing = emailKey ? await this.userRepository.findByEmailKey(emailKey) : null;
    if (existing) return this.link(existing, linked);

    const user = User.createFromExternalIdentity({
      id: this.idGenerator.newId(),
      email: identity.email,
      displayName: null,
      provider: identity.provider,
      subject: identity.subject,
      emailVerified: identity.emailVerified === true,
    });
    try {
      await this.userRepository.add(user);
      return user;
    } catch (error) {
      // A sign-in code made the account for this address meanwhile: use it.
      const winner = error instanceof EmailKeyTakenError ? await this.userRepository.findByEmailKey(error.emailKey) : null;
      if (!winner) throw error;
      return this.link(winner, linked);
    }
  }

  private async link(user: User, identity: ExternalIdentity): Promise<User> {
    user.linkExternalIdentity(identity);
    await this.userRepository.update(user);
    return user;
  }
}
