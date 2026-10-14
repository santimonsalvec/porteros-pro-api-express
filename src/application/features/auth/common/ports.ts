import type { EmailSendResult } from '../../../common/email.js';
import type { IRepository } from '../../../common/persistence/repository.js';
import type { ExternalIdentity } from '../../../../domain/users/externalIdentity.js';
import type { RefreshToken } from '../../../../domain/users/refreshToken.js';
import type { User } from '../../../../domain/users/user.js';
import type { LoginCodeAudience, LoginCodeState } from '../../../../domain/auth/loginCode.js';
import type { StoredAccessSettings } from '../../../../domain/auth/accessSettings.js';
import type { AccessTokenClaims } from './accessTokenClaims.js';
import type { SsoProviderConfig, TokenPairResponse } from './dtos.js';

export interface ISsoProviderCatalog {
  /** Returns an empty list for a platform with nothing configured. */
  getProviders(platform: string): SsoProviderConfig[];
}

/** An app sign-in's Google identity, with whether Google verified its email (admin spec 009). */
export type AppGoogleIdentity = ExternalIdentity & { emailVerified?: boolean };

export interface IGoogleIdTokenValidator {
  /**
   * Returns `null` (never throws for "just invalid") on any validation failure. `emailVerified`
   * says whether the address may find an account a sign-in code made (admin spec 009, Q1).
   */
  validate(credential: string, platform: string): Promise<AppGoogleIdentity | null>;
  /**
   * The admin web's sign-in: validated against the `admin-web` client, and it keeps what the
   * staff invitation needs — whether Google verified the email, and the name to show.
   */
  validateForAdmin(credential: string): Promise<AdminGoogleIdentity | null>;
}

export interface AdminGoogleIdentity {
  identity: ExternalIdentity;
  emailVerified: boolean;
  displayName: string | null;
}

export interface TokenIssueOptions {
  /** Adds the `isGoalkeeper` claim. Omitted (not `"false"`) when the account has no active goalkeeper profile. */
  isGoalkeeper?: boolean;
}

export interface IInternalTokenIssuer {
  issue(user: User, options?: TokenIssueOptions): Promise<TokenPairResponse>;
  verifyAccessToken(token: string): Promise<AccessTokenClaims | null>;
  /** Hashes a raw refresh token the same way `issue` does, for lookup purposes. */
  hashRefreshToken(rawRefreshToken: string): string;
}

export interface IUserRepository extends IRepository<User, string> {
  findByExternalIdentity(provider: string, subject: string): Promise<User | null>;
  /**
   * The account of a proven, normalized email (admin spec 009). `add` throws `EmailKeyTakenError`
   * when another account already has that key.
   */
  findByEmailKey(emailKey: string): Promise<User | null>;
  /** The users with these ids, in no particular order; unknown ids are simply absent. */
  getByIds(ids: string[]): Promise<User[]>;
  existsByPhoneNumber(
    countryCallingCode: string,
    whatsAppNumber: string,
    excludeUserId?: string,
  ): Promise<boolean>;
}

/** Two first sign-ins for the same proven email at once: the second one reads the first account. */
export class EmailKeyTakenError extends Error {
  constructor(readonly emailKey: string) {
    super('Another account already has this email key');
    this.name = 'EmailKeyTakenError';
  }
}

export interface IRefreshTokenRepository extends IRepository<RefreshToken, string> {
  findActiveByHash(tokenHash: string): Promise<RefreshToken | null>;
  markUsed(id: string): Promise<void>;
}

/** Records each SSO authentication attempt's outcome for security audit purposes (FR-010). */
export interface IAuditLogger {
  logSsoAttempt(entry: { provider: string; platform: string; success: boolean; reason?: string }): void;
}

/**
 * The app's sign-in code requests and checks in the security log (admin spec 009, FR-020): the
 * product, the outcome and the masked address; never the code nor its hash.
 */
export interface ILoginCodeAuditLogger {
  logEmailCodeEvent(entry: { event: 'request' | 'verify'; audience: 'app' | 'admin'; outcome: string; emailMasked: string }): void;
}

/** Generates new entity ids (UUIDv7), abstracted so handlers stay pure/testable. */
export interface IIdGenerator {
  newId(): string;
}

export interface LoginCodeEmail {
  to: string;
  /** Six digits, as text: a leading zero stays. */
  code: string;
  /** The minutes the code was issued with; the email shows this number (FR-011). */
  expiryMinutes: number;
  idempotencyKey: string;
}

/** Sends a sign-in code (admin spec 009, FR-003): the rules only know this port, not the template. */
export interface ILoginCodeMailer {
  sendLoginCode(email: LoginCodeEmail): Promise<EmailSendResult>;
}

/** Six random digits, as text (admin spec 009, research §2). */
export interface IOneTimeCodeGenerator {
  next(): string;
}

/** The code's HMAC, bound to its product and address, so a code never works elsewhere (FR-017, FR-019). */
export interface ILoginCodeHasher {
  hash(input: { audience: LoginCodeAudience; email: string; code: string }): string;
}

export type LoginCodeWriteResult = 'saved' | 'conflict';

/**
 * One document per product and address (admin spec 009, research §3). Every write but `consume`
 * and `recordFailure` is at a revision, so two requests at once never both send a code.
 */
export interface ILoginCodeStore {
  get(audience: LoginCodeAudience, email: string): Promise<LoginCodeState | null>;
  /** The first code of an address; `conflict` when another request created it meanwhile. */
  insert(state: LoginCodeState): Promise<LoginCodeWriteResult>;
  /** Writes `next` only while the stored document is still at `expectedRevision`. */
  replaceAtRevision(next: LoginCodeState, expectedRevision: number): Promise<LoginCodeWriteResult>;
  /** Marks the code used if this is its hash and it is still active, in time and under 5 failures: one winner. */
  consume(audience: LoginCodeAudience, email: string, codeHash: string, now: Date): Promise<boolean>;
  /** One more failed attempt on the active code; the third one invalidates it. */
  recordFailure(audience: LoginCodeAudience, email: string, now: Date): Promise<void>;
}

/** The one `accessSettings` document (admin spec 009, research §5). */
export interface IAccessSettingsRepository {
  get(): Promise<StoredAccessSettings | null>;
  /** The first save, at revision 0; `stale` when someone saved first. */
  create(settings: Omit<StoredAccessSettings, 'revision'>): Promise<'saved' | 'stale'>;
  update(settings: Omit<StoredAccessSettings, 'revision'>, expectedRevision: number): Promise<'saved' | 'stale'>;
}
