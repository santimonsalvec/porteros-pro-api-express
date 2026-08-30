import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator, IInternalTokenIssuer, IRefreshTokenRepository, IUserRepository } from '../../common/ports.js';
import { RefreshToken } from '../../../../../domain/users/refreshToken.js';
import { RefreshAccessTokenCommand, type RefreshAccessTokenResult } from './refreshAccessTokenCommand.js';

const REFRESH_TOKEN_LIFETIME_MS_DEFAULT = 1000 * 60 * 60 * 24 * 30;

/**
 * Single-use rotation: on success the old token is marked used and a brand-new
 * access+refresh pair is issued. Every rejection reason (unrecognized, used,
 * expired) collapses to the same `invalid_refresh_token` outcome (FR-043).
 */
export class RefreshAccessTokenCommandHandler
  implements ICommandHandler<RefreshAccessTokenCommand, RefreshAccessTokenResult>
{
  constructor(
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    private readonly userRepository: IUserRepository,
    private readonly tokenIssuer: IInternalTokenIssuer,
    private readonly idGenerator: IIdGenerator,
    private readonly refreshTokenLifetimeMs: number = REFRESH_TOKEN_LIFETIME_MS_DEFAULT,
  ) {}

  async handle(command: RefreshAccessTokenCommand): Promise<RefreshAccessTokenResult> {
    const tokenHash = this.tokenIssuer.hashRefreshToken(command.refreshToken);
    const existing = await this.refreshTokenRepository.findActiveByHash(tokenHash);
    if (!existing) {
      return { outcome: 'invalid_refresh_token' };
    }

    const user = await this.userRepository.getById(existing.userId);
    if (!user) {
      return { outcome: 'invalid_refresh_token' };
    }

    await this.refreshTokenRepository.markUsed(existing.id);

    const tokens = await this.tokenIssuer.issue(user);
    const newRefreshToken = RefreshToken.create(
      this.idGenerator.newId(),
      user.id,
      this.tokenIssuer.hashRefreshToken(tokens.refreshToken),
      this.refreshTokenLifetimeMs,
    );
    await this.refreshTokenRepository.add(newRefreshToken);

    return { outcome: 'success', tokens };
  }
}
