import type { Language } from '../../../../../src/domain/i18n/language.js';
import type { LoginCodeDependencies, LoginCodeLogEntry } from '../../../../../src/application/features/auth/common/requestLoginCode.js';
import { HmacLoginCodeHasher } from '../../../../../src/infrastructure/auth/hmacLoginCodeHasher.js';
import { FakeAccessSettingsRepository } from '../../../../fakes/fakeAccessSettingsRepository.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeDurableRateLimiter } from '../../../../fakes/fakeDurableRateLimiter.js';
import { FakeLoginCodeMailer } from '../../../../fakes/fakeLoginCodeMailer.js';
import { FakeLoginCodeStore } from '../../../../fakes/fakeLoginCodeStore.js';

export const LOGIN_CODE_NOW = new Date('2026-10-14T15:00:00.000Z');

/** The sign-in code's dependencies over fakes (admin spec 009); codes come out as 100001, 100002… */
export function loginCodeHarness() {
  const clock = new FixedClock(LOGIN_CODE_NOW);
  const codes = new FakeLoginCodeStore();
  const mailer = new FakeLoginCodeMailer();
  const limiter = new FakeDurableRateLimiter();
  const settings = new FakeAccessSettingsRepository();
  const logs: LoginCodeLogEntry[] = [];
  /** The language the account of each normalized address chose (feature 032). */
  const languages: Record<string, Language> = {};
  let codeCounter = 100_000;
  let idCounter = 0;
  const deps: LoginCodeDependencies = {
    codes,
    mailer,
    hasher: new HmacLoginCodeHasher(() => 'test-signing-key'),
    generator: { next: () => String(++codeCounter) },
    limiter,
    settings,
    ids: { newId: () => `code-${++idCounter}` },
    clock,
    log: (entry) => logs.push(entry),
    languageOfEmail: async (email) => languages[email] ?? null,
  };
  return { deps, clock, codes, mailer, limiter, settings, logs, languages };
}
