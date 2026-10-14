import { describe, expect, it } from 'vitest';
import {
  canIssue,
  issueLoginCode,
  loginCodeId,
  MAX_FAILED_ATTEMPTS,
  revertFailedSend,
  verificationOutcome,
  type LoginCodeState,
} from '../../../../src/domain/auth/loginCode.js';

const NOW = new Date('2026-10-14T15:00:00.000Z');
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const at = (ms: number) => new Date(NOW.getTime() + ms);

const issue = (previous: LoginCodeState | null, now: Date, codeId = 'code-1', codeHash: string | null = 'hash-1', expiryMinutes = 2) =>
  issueLoginCode(previous, { audience: 'app', email: 'juana@gmail.com', codeId, codeHash, expiryMinutes, now });

/** A state whose successful sends happened at these offsets from NOW (ms). */
function sentAt(...offsets: number[]): LoginCodeState {
  let state: LoginCodeState | null = null;
  offsets.forEach((offset, index) => {
    state = issue(state, at(offset), `code-${index + 1}`, `hash-${index + 1}`);
  });
  return state!;
}

describe('loginCodeId', () => {
  it('is one document per product and address', () => {
    expect(loginCodeId('app', 'juana@gmail.com')).toBe('app:juana@gmail.com');
    expect(loginCodeId('admin', 'juana@gmail.com')).toBe('admin:juana@gmail.com');
  });
});

describe('canIssue', () => {
  it('lets the first code go out', () => {
    expect(canIssue(null, NOW)).toEqual({ outcome: 'ok' });
  });

  it('asks to wait until 60 s have passed since the last send', () => {
    const state = sentAt(0);
    expect(canIssue(state, at(59 * SECOND))).toEqual({ outcome: 'resend_too_soon', retryAfterSeconds: 1 });
    expect(canIssue(state, at(15 * SECOND))).toEqual({ outcome: 'resend_too_soon', retryAfterSeconds: 45 });
    expect(canIssue(state, at(60 * SECOND))).toEqual({ outcome: 'ok' });
  });

  it('stops at 5 sends within the last 60 minutes, until the oldest one leaves the window', () => {
    const state = sentAt(0, 10 * MINUTE, 20 * MINUTE, 30 * MINUTE, 40 * MINUTE);
    expect(canIssue(state, at(50 * MINUTE))).toEqual({
      outcome: 'too_many_codes',
      retryAfterSeconds: 10 * 60,
      retryAt: at(HOUR),
    });
    expect(canIssue(state, at(HOUR))).toEqual({ outcome: 'ok' });
  });

  it('checks the wait before the hourly limit', () => {
    const state = sentAt(0, MINUTE, 2 * MINUTE, 3 * MINUTE, 4 * MINUTE);
    expect(canIssue(state, at(4 * MINUTE + 30 * SECOND)).outcome).toBe('resend_too_soon');
  });
});

describe('issueLoginCode', () => {
  it('starts a fresh code that expires with the minutes it was issued with', () => {
    const state = issue(null, NOW, 'code-1', 'hash-1', 5);
    expect(state).toEqual({
      id: 'app:juana@gmail.com',
      audience: 'app',
      email: 'juana@gmail.com',
      codeId: 'code-1',
      codeHash: 'hash-1',
      status: 'active',
      issuedAt: NOW,
      expiresAt: at(5 * MINUTE),
      expiryMinutes: 5,
      failedAttempts: 0,
      sends: [NOW],
      lastSentAt: NOW,
      revision: 0,
      purgeAt: at(5 * MINUTE + 24 * HOUR),
    });
  });

  it('replaces the previous code, resets the attempts and keeps only the last hour of sends', () => {
    const first = issue(null, NOW);
    const failed = { ...first, failedAttempts: 3 };
    const second = issue(failed, at(HOUR + MINUTE), 'code-2', 'hash-2');
    expect(second.codeId).toBe('code-2');
    expect(second.codeHash).toBe('hash-2');
    expect(second.failedAttempts).toBe(0);
    expect(second.sends).toEqual([at(HOUR + MINUTE)]);
    expect(second.revision).toBe(1);
  });

  it('records a request without a code for an address that has no access (status none)', () => {
    const state = issue(null, NOW, 'code-1', null);
    expect(state.status).toBe('none');
    expect(state.codeHash).toBeNull();
    expect(state.sends).toEqual([NOW]);
  });
});

describe('revertFailedSend', () => {
  it('invalidates the code that never arrived and gives back its send', () => {
    const first = issue(null, NOW);
    const second = issue(first, at(2 * MINUTE), 'code-2', 'hash-2');
    const reverted = revertFailedSend(second, 'code-2', first.lastSentAt, at(2 * MINUTE + SECOND));
    expect(reverted).toMatchObject({ status: 'invalidated', sends: [NOW], lastSentAt: NOW, revision: 2 });
    expect(reverted!.purgeAt).toEqual(at(2 * MINUTE + SECOND + 24 * HOUR));
    expect(canIssue(reverted, at(2 * MINUTE + 2 * SECOND))).toEqual({ outcome: 'ok' });
  });

  it('invalidates the code even when its send is no longer in the last hour', () => {
    const state = { ...issue(null, NOW), sends: [] };
    expect(revertFailedSend(state, 'code-1', null, at(SECOND))).toMatchObject({ status: 'invalidated', sends: [] });
  });

  it('leaves alone a code that was already replaced', () => {
    const state = issue(issue(null, NOW), at(2 * MINUTE), 'code-2', 'hash-2');
    expect(revertFailedSend(state, 'code-1', null, at(3 * MINUTE))).toBeNull();
  });
});

describe('verificationOutcome', () => {
  it('is invalid_code without a code, or when it was used, invalidated or never issued', () => {
    const state = issue(null, NOW);
    expect(verificationOutcome(null, NOW)).toBe('invalid_code');
    expect(verificationOutcome({ ...state, status: 'used' }, NOW)).toBe('invalid_code');
    expect(verificationOutcome({ ...state, status: 'none', codeHash: null }, NOW)).toBe('invalid_code');
    expect(verificationOutcome({ ...state, status: 'active' }, NOW)).toBe('invalid_code');
  });

  it('is code_expired once the code reached its expiry', () => {
    expect(verificationOutcome(issue(null, NOW), at(2 * MINUTE))).toBe('code_expired');
  });

  it('is too_many_attempts after the third failure', () => {
    const state = { ...issue(null, NOW), failedAttempts: MAX_FAILED_ATTEMPTS, status: 'invalidated' as const };
    expect(verificationOutcome(state, at(SECOND))).toBe('too_many_attempts');
  });
});
