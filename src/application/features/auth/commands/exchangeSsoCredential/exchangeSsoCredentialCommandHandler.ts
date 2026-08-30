import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type {
  IAuditLogger,
  IGoogleIdTokenValidator,
  IIdGenerator,
  IInternalTokenIssuer,
  IRefreshTokenRepository,
  IUserRepository,
} from '../../common/ports.js';
import { RefreshToken } from '../../../../../domain/users/refreshToken.js';
import { User } from '../../../../../domain/users/user.js';
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
    private readonly idGenerator: IIdGenerator,
    private readonly auditLogger: IAuditLogger,
    private readonly refreshTokenLifetimeMs: number = REFRESH_TOKEN_LIFETIME_MS_DEFAULT,
  ) {}

  async handle(command: ExchangeSsoCredentialCommand): Promise<ExchangeSsoCredentialResult> {
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

    let user = await this.userRepository.findByExternalIdentity(identity.provider, identity.subject);

    if (command.platform === 'admin-web') {
      if (!user || !user.isAdmin) {
        this.auditLogger.logSsoAttempt({
          provider: command.provider,
          platform: command.platform,
          success: false,
          reason: 'unauthorized_admin_account',
        });
        return { outcome: 'unauthorized_admin_account' };
      }
    } else if (!user) {
      user = User.createFromExternalIdentity({
        id: this.idGenerator.newId(),
        email: identity.email,
        displayName: null,
        provider: identity.provider,
        subject: identity.subject,
      });
      await this.userRepository.add(user);
    }

    const tokens = await this.tokenIssuer.issue(user);
    const refreshToken = RefreshToken.create(
      this.idGenerator.newId(),
      user.id,
      this.tokenIssuer.hashRefreshToken(tokens.refreshToken),
      this.refreshTokenLifetimeMs,
    );
    await this.refreshTokenRepository.add(refreshToken);

    this.auditLogger.logSsoAttempt({ provider: command.provider, platform: command.platform, success: true });
    return { outcome: 'success', tokens };
  }
}
