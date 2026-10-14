import { describe, expect, it } from 'vitest';
import { requestLoginCode } from '../../../../../src/application/features/auth/common/requestLoginCode.js';
import { verifyLoginCode } from '../../../../../src/application/features/auth/common/verifyLoginCode.js';
import { LOGIN_CODE_NOW, loginCodeHarness } from './loginCodeHarness.js';

const MINUTE = 60 * 1000;

describe('the expiry a code was issued with (admin spec 009, FR-011)', () => {
  it('uses the configured minutes for the next code and its email', async () => {
    const h = loginCodeHarness();
    h.settings.stored = { loginCodeExpiryMinutes: 5, revision: 0, updatedAt: LOGIN_CODE_NOW, updatedBy: 'user-1' };

    await requestLoginCode(h.deps, { audience: 'app', email: 'juana@gmail.com', ip: '1.2.3.4', deliver: async () => true });

    expect(h.mailer.sent[0]!.expiryMinutes).toBe(5);
    h.clock.advance(4 * MINUTE);
    const check = await verifyLoginCode(h.deps, { audience: 'app', email: 'juana@gmail.com', code: h.mailer.lastCode(), ip: '1.2.3.4' });
    expect(check.outcome).toBe('verified');
  });

  it('keeps a code issued with 2 minutes at 2, even if the expiry grows meanwhile', async () => {
    const h = loginCodeHarness();
    await requestLoginCode(h.deps, { audience: 'app', email: 'juana@gmail.com', ip: '1.2.3.4', deliver: async () => true });
    h.settings.stored = { loginCodeExpiryMinutes: 10, revision: 0, updatedAt: LOGIN_CODE_NOW, updatedBy: 'user-1' };
    h.clock.advance(3 * MINUTE);

    const check = await verifyLoginCode(h.deps, { audience: 'app', email: 'juana@gmail.com', code: h.mailer.lastCode(), ip: '1.2.3.4' });

    expect(check.outcome).toBe('code_expired');
  });
});
