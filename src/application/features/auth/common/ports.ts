import type { IRepository } from '../../../common/persistence/repository.js';
import type { ExternalIdentity } from '../../../../domain/users/externalIdentity.js';
import type { RefreshToken } from '../../../../domain/users/refreshToken.js';
import type { User } from '../../../../domain/users/user.js';
import type { AccessTokenClaims } from './accessTokenClaims.js';
import type { SsoProviderConfig, TokenPairResponse } from './dtos.js';

export interface ISsoProviderCatalog {
  /** Returns an empty list for a platform with nothing configured. */
  getProviders(platform: string): SsoProviderConfig[];
}

export interface IGoogleIdTokenValidator {
  /** Returns `null` (never throws for "just invalid") on any validation failure. */
  validate(credential: string, platform: string): Promise<ExternalIdentity | null>;
}

export interface IInternalTokenIssuer {
  issue(user: User): Promise<TokenPairResponse>;
  verifyAccessToken(token: string): Promise<AccessTokenClaims | null>;
  /** Hashes a raw refresh token the same way `issue` does, for lookup purposes. */
  hashRefreshToken(rawRefreshToken: string): string;
}

export interface IUserRepository extends IRepository<User, string> {
  findByExternalIdentity(provider: string, subject: string): Promise<User | null>;
  existsByPhoneNumber(
    countryCallingCode: string,
    whatsAppNumber: string,
    excludeUserId?: string,
  ): Promise<boolean>;
}

export interface IRefreshTokenRepository extends IRepository<RefreshToken, string> {
  findActiveByHash(tokenHash: string): Promise<RefreshToken | null>;
  markUsed(id: string): Promise<void>;
}

/** Records each SSO authentication attempt's outcome for security audit purposes (FR-010). */
export interface IAuditLogger {
  logSsoAttempt(entry: { provider: string; platform: string; success: boolean; reason?: string }): void;
}

/** Generates new entity ids (UUIDv7), abstracted so handlers stay pure/testable. */
export interface IIdGenerator {
  newId(): string;
}
