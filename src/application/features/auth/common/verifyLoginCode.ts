import { maskEmail, normalizeEmail } from '../../../../domain/common/email.js';
import { MAX_FAILED_ATTEMPTS, verificationOutcome, type LoginCodeAudience, type VerificationFailure } from '../../../../domain/auth/loginCode.js';
import { VERIFICATIONS_PER_ADDRESS_PER_HOUR, type LoginCodeDependencies } from './requestLoginCode.js';

const CODE_SHAPE = /^\d{6}$/;
const HOUR_SECONDS = 3600;

export type VerifyLoginCodeResult =
  | { outcome: 'verified'; email: string; log: (outcome: string) => void }
  | { outcome: VerificationFailure }
  | { outcome: 'too_many_requests'; retryAfterSeconds: number };

/** The code as the person may type or paste it: spaces and dashes do not count (spec edge case). */
export function normalizeLoginCode(raw: string): string {
  return raw.replace(/[\s-]/g, '');
}

/**
 * Checks a sign-in code (admin spec 009, research §3, FR-010): the limit per network address, then
 * one atomic step that uses the code up if it is the last one issued, active,  in time and under three
 * failures. A wrong code counts as a failure; the third one invalidates it. The caller logs what
 * happens after `verified` with the returned `log`.
 */
export async function verifyLoginCode(
  deps: Pick<LoginCodeDependencies, 'codes' | 'hasher' | 'limiter' | 'clock' | 'log'>,
  request: { audience: LoginCodeAudience; email: string; code: string; ip: string },
): Promise<VerifyLoginCodeResult> {
  const email = normalizeEmail(request.email);
  if (!email) return { outcome: 'invalid_code' };
  const log = (outcome: string) => deps.log({ event: 'verify', audience: request.audience, outcome, emailMasked: maskEmail(email) });
  const now = deps.clock.now();

  const allowed = await deps.limiter.tryConsume(`email-code:verify:${request.ip}`, VERIFICATIONS_PER_ADDRESS_PER_HOUR, HOUR_SECONDS, now);
  if (!allowed.allowed) {
    log('too_many_requests');
    return { outcome: 'too_many_requests', retryAfterSeconds: allowed.retryAfterSeconds };
  }

  const code = normalizeLoginCode(request.code);
  if (!CODE_SHAPE.test(code)) {
    log('invalid_code');
    return { outcome: 'invalid_code' };
  }

  const codeHash = deps.hasher.hash({ audience: request.audience, email, code });
  if (await deps.codes.consume(request.audience, email, codeHash, now)) return { outcome: 'verified', email, log };

  const state = await deps.codes.get(request.audience, email);
  let outcome = verificationOutcome(state, now);
  if (outcome === 'invalid_code' && state?.status === 'active') {
    await deps.codes.recordFailure(request.audience, email, now);
    if (state.failedAttempts + 1 >= MAX_FAILED_ATTEMPTS) outcome = 'too_many_attempts';
  }
  log(outcome);
  return { outcome };
}
