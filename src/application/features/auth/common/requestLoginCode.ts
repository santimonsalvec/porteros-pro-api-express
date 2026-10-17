import type { IClock } from '../../../common/clock.js';
import type { IDurableRateLimiter } from '../../../common/rateLimit.js';
import { maskEmail, normalizeEmail } from '../../../../domain/common/email.js';
import {
  canIssue,
  issueLoginCode,
  RESEND_COOLDOWN_SECONDS,
  revertFailedSend,
  type LoginCodeAudience,
} from '../../../../domain/auth/loginCode.js';
import { resolveLanguage, type Language } from '../../../../domain/i18n/language.js';
import { currentLoginCodeExpiryMinutes } from './loginCodeExpiry.js';
import type {
  IAccessSettingsRepository,
  IIdGenerator,
  ILoginCodeHasher,
  ILoginCodeMailer,
  ILoginCodeStore,
  IOneTimeCodeGenerator,
} from './ports.js';

/** Requests per network address and hour, shared by the app and the admin web (spec edge case). */
export const REQUESTS_PER_ADDRESS_PER_HOUR = 20;
/** Verifications per network address and hour (research §6). */
export const VERIFICATIONS_PER_ADDRESS_PER_HOUR = 60;
const HOUR_SECONDS = 3600;

/** What the security log keeps of a code request or check (FR-020): never the code, the address masked. */
export interface LoginCodeLogEntry {
  event: 'request' | 'verify';
  audience: LoginCodeAudience;
  outcome: string;
  emailMasked: string;
}

export interface LoginCodeDependencies {
  codes: ILoginCodeStore;
  mailer: ILoginCodeMailer;
  hasher: ILoginCodeHasher;
  generator: IOneTimeCodeGenerator;
  limiter: IDurableRateLimiter;
  settings: Pick<IAccessSettingsRepository, 'get'>;
  ids: IIdGenerator;
  clock: IClock;
  log: (entry: LoginCodeLogEntry) => void;
  /** The language the account of a normalized address chose (feature 032); null when none or no account. */
  languageOfEmail: (email: string) => Promise<Language | null>;
}

export interface LoginCodeRequest {
  audience: LoginCodeAudience;
  email: string;
  ip: string;
  /**
   * Whether this normalized address may get a code. The admin web answers the same either way and
   * records a request without a code for an address with no access (research §7).
   */
  deliver: (email: string) => Promise<boolean>;
  /** The caller's `Accept-Language`: the email's language when the account has none (feature 032). */
  language?: Language | null;
}

export type RequestLoginCodeResult =
  | { outcome: 'sent'; email: string; expiresAt: Date; expiryMinutes: number; resendAfterSeconds: number }
  | { outcome: 'invalid_email' }
  | { outcome: 'too_many_requests'; retryAfterSeconds: number }
  | { outcome: 'resend_too_soon'; retryAfterSeconds: number }
  | { outcome: 'too_many_codes'; retryAfterSeconds: number; retryAt: Date }
  | { outcome: 'delivery_failed' };

/**
 * Issues and sends a sign-in code (admin spec 009, research §3): the address, the limit per network
 * address, the wait and the hourly limit, then a new code that replaces the last one, written at the
 * revision read. A send the provider fails is given back, so it never counts (FR-008).
 */
export async function requestLoginCode(deps: LoginCodeDependencies, request: LoginCodeRequest): Promise<RequestLoginCodeResult> {
  const email = normalizeEmail(request.email);
  if (!email) return { outcome: 'invalid_email' };
  const log = (outcome: string) => deps.log({ event: 'request', audience: request.audience, outcome, emailMasked: maskEmail(email) });
  const now = deps.clock.now();

  const allowed = await deps.limiter.tryConsume(`email-code:request:${request.ip}`, REQUESTS_PER_ADDRESS_PER_HOUR, HOUR_SECONDS, now);
  if (!allowed.allowed) {
    log('too_many_requests');
    return { outcome: 'too_many_requests', retryAfterSeconds: allowed.retryAfterSeconds };
  }

  const previous = await deps.codes.get(request.audience, email);
  const decision = canIssue(previous, now);
  if (decision.outcome !== 'ok') {
    log(decision.outcome);
    return decision;
  }

  const deliver = await request.deliver(email);
  const code = deps.generator.next();
  const codeId = deps.ids.newId();
  const expiryMinutes = await currentLoginCodeExpiryMinutes(deps.settings);
  const issued = issueLoginCode(previous, {
    audience: request.audience,
    email,
    codeId,
    codeHash: deliver ? deps.hasher.hash({ audience: request.audience, email, code }) : null,
    expiryMinutes,
    now,
  });
  const written = previous ? await deps.codes.replaceAtRevision(issued, previous.revision) : await deps.codes.insert(issued);
  if (written === 'conflict') {
    log('resend_too_soon');
    return { outcome: 'resend_too_soon', retryAfterSeconds: RESEND_COOLDOWN_SECONDS };
  }

  if (deliver) {
    const language = resolveLanguage(await deps.languageOfEmail(email), request.language);
    const sent = await deps.mailer.sendLoginCode({ to: email, code, expiryMinutes, idempotencyKey: codeId, language });
    if (sent.outcome === 'failed') {
      const reverted = revertFailedSend(issued, codeId, previous?.lastSentAt ?? null, deps.clock.now());
      if (reverted) await deps.codes.replaceAtRevision(reverted, issued.revision);
      log('delivery_failed');
      return { outcome: 'delivery_failed' };
    }
  }

  log(deliver ? 'sent' : 'no_access');
  return { outcome: 'sent', email, expiresAt: issued.expiresAt, expiryMinutes, resendAfterSeconds: RESEND_COOLDOWN_SECONDS };
}
