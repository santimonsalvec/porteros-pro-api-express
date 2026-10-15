import { RefreshToken } from '../../../../domain/users/refreshToken.js';
import type { User } from '../../../../domain/users/user.js';
import type { IGoalkeeperProfileRepository } from '../../goalkeepers/common/ports.js';
import { NO_CLOSED_ACCOUNTS, type ClosedAccounts } from '../../accountClosures/common/closedAccounts.js';
import { isBlocked, type BlockedUsers } from '../../users/common/blockedUsers.js';
import type { TokenPairResponse } from './dtos.js';
import type { IIdGenerator, IInternalTokenIssuer, IRefreshTokenRepository } from './ports.js';

export interface AppSessionDependencies {
  refreshTokenRepository: IRefreshTokenRepository;
  tokenIssuer: IInternalTokenIssuer;
  goalkeeperProfileRepository: Pick<IGoalkeeperProfileRepository, 'getByUserId'>;
  idGenerator: IIdGenerator;
  refreshTokenLifetimeMs: number;
  blockedUsers: BlockedUsers;
  /** Brings back an account an administrator closed (feature 029); absent where closures are not wired. */
  closedAccounts?: ClosedAccounts;
}

export type AppSessionResult = { outcome: 'success'; tokens: TokenPairResponse } | { outcome: 'account_blocked' };

/**
 * The app's session for an account that just proved who it is, with Google or with a sign-in code
 * (admin spec 009, research §8): the block check, the goalkeeper claim, and the stored refresh
 * token. One place, so both ways of signing in always end the same.
 */
export async function issueAppSession(deps: AppSessionDependencies, user: User): Promise<AppSessionResult> {
  // A new account can't be blocked yet; an existing one may be (porteros-pro-admin spec 005).
  if (await isBlocked(deps.blockedUsers, user.id)) return { outcome: 'account_blocked' };
  // Signing in again is what reopens a closed account (feature 029, FR-031).
  await (deps.closedAccounts ?? NO_CLOSED_ACCOUNTS).reopenIfClosed(user.id);

  const isGoalkeeper = (await deps.goalkeeperProfileRepository.getByUserId(user.id)) !== null;
  const tokens = await deps.tokenIssuer.issue(user, { isGoalkeeper });
  const refreshToken = RefreshToken.create(
    deps.idGenerator.newId(),
    user.id,
    deps.tokenIssuer.hashRefreshToken(tokens.refreshToken),
    deps.refreshTokenLifetimeMs,
  );
  await deps.refreshTokenRepository.add(refreshToken);
  return { outcome: 'success', tokens };
}
