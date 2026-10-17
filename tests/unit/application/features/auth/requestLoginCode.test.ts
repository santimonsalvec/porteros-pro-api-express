import { describe, expect, it } from 'vitest';
import { requestLoginCode } from '../../../../../src/application/features/auth/common/requestLoginCode.js';
import { LOGIN_CODE_NOW, loginCodeHarness } from './loginCodeHarness.js';

const MINUTE = 60 * 1000;
const at = (ms: number) => new Date(LOGIN_CODE_NOW.getTime() + ms);
const ask = (h: ReturnType<typeof loginCodeHarness>, overrides: Partial<Parameters<typeof requestLoginCode>[1]> = {}) =>
  requestLoginCode(h.deps, { audience: 'app', email: ' Juana@Gmail.com ', ip: '1.2.3.4', deliver: async () => true, ...overrides });

describe('requestLoginCode (admin spec 009, research §3)', () => {
  it('refuses an address that is not an email, writing and sending nothing', async () => {
    const h = loginCodeHarness();

    expect(await ask(h, { email: 'juana@' })).toEqual({ outcome: 'invalid_email' });
    expect(h.codes.states.size).toBe(0);
    expect(h.mailer.sent).toEqual([]);
  });

  it('sends a code with the current expiry and answers when it expires', async () => {
    const h = loginCodeHarness();

    const result = await ask(h);

    expect(result).toEqual({ outcome: 'sent', email: 'juana@gmail.com', expiresAt: at(2 * MINUTE), expiryMinutes: 2, resendAfterSeconds: 60 });
    expect(h.mailer.sent).toEqual([{ to: 'juana@gmail.com', code: '100001', expiryMinutes: 2, idempotencyKey: 'code-1', language: 'es' }]);
  });

  it("sends the email in the account's language, else the caller's, else Spanish (feature 032)", async () => {
    const h = loginCodeHarness();
    h.languages['juana@gmail.com'] = 'en';

    await ask(h);
    h.clock.advance(2 * MINUTE);
    await ask(h, { email: 'nueva@gmail.com', language: 'en' });
    h.clock.advance(2 * MINUTE);
    await ask(h, { email: 'otra@gmail.com', language: null });

    expect(h.mailer.sent.map((email) => [email.to, email.language])).toEqual([
      ['juana@gmail.com', 'en'],
      ['nueva@gmail.com', 'en'],
      ['otra@gmail.com', 'es'],
    ]);
  });

  it('stores the hash, never the code', async () => {
    const h = loginCodeHarness();

    await ask(h);

    const stored = h.codes.peek('app', 'juana@gmail.com')!;
    expect(stored.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain('100001');
  });

  it('uses the expiry configured from the admin', async () => {
    const h = loginCodeHarness();
    h.settings.stored = { loginCodeExpiryMinutes: 5, revision: 1, updatedAt: LOGIN_CODE_NOW, updatedBy: 'user-1' };

    const result = await ask(h);

    expect(result).toMatchObject({ outcome: 'sent', expiresAt: at(5 * MINUTE), expiryMinutes: 5 });
    expect(h.mailer.sent[0]!.expiryMinutes).toBe(5);
  });

  it('honours the limit per network address, shared by both products', async () => {
    const h = loginCodeHarness();

    await ask(h);
    expect(h.limiter.calls[0]).toEqual({ key: 'email-code:request:1.2.3.4', limit: 20, windowSeconds: 3600 });
    for (let index = 0; index < 19; index += 1) {
      h.clock.advance(MINUTE);
      await ask(h, { email: `persona${index}@gmail.com`, audience: index % 2 === 0 ? 'app' : 'admin' });
    }
    h.clock.advance(MINUTE);

    expect(await ask(h, { email: 'otra@gmail.com' })).toEqual({ outcome: 'too_many_requests', retryAfterSeconds: 40 * 60 });
  });

  it('asks to wait 60 s between sends and stops at five in an hour', async () => {
    const h = loginCodeHarness();

    await ask(h);
    h.clock.advance(30 * 1000);
    expect(await ask(h)).toEqual({ outcome: 'resend_too_soon', retryAfterSeconds: 30 });

    for (let send = 2; send <= 5; send += 1) {
      h.clock.set(at((send - 1) * 10 * MINUTE));
      expect((await ask(h)).outcome).toBe('sent');
    }
    h.clock.set(at(50 * MINUTE));
    expect(await ask(h)).toEqual({ outcome: 'too_many_codes', retryAfterSeconds: 10 * 60, retryAt: at(60 * MINUTE) });
  });

  it('answers resend_too_soon when another request wrote first', async () => {
    const h = loginCodeHarness();
    h.codes.conflictNext = true;

    expect(await ask(h)).toEqual({ outcome: 'resend_too_soon', retryAfterSeconds: 60 });
    expect(h.mailer.sent).toEqual([]);
  });

  it('gives back a send the provider failed, so the person can try again right away', async () => {
    const h = loginCodeHarness();
    h.mailer.next = { outcome: 'failed', reason: 'transient' };

    expect(await ask(h)).toEqual({ outcome: 'delivery_failed' });
    expect(h.codes.peek('app', 'juana@gmail.com')).toMatchObject({ status: 'invalidated', sends: [], lastSentAt: null });

    h.mailer.next = { outcome: 'sent' };
    h.clock.advance(1000);
    expect((await ask(h)).outcome).toBe('sent');
  });

  it('records an address without access with the same answer, and sends nothing', async () => {
    const withAccess = loginCodeHarness();
    const withoutAccess = loginCodeHarness();

    const sent = await ask(withAccess, { audience: 'admin' });
    const silent = await ask(withoutAccess, { audience: 'admin', deliver: async () => false });

    expect(silent).toEqual(sent);
    expect(withoutAccess.mailer.sent).toEqual([]);
    expect(withoutAccess.codes.peek('admin', 'juana@gmail.com')).toMatchObject({ status: 'none', codeHash: null, sends: [LOGIN_CODE_NOW] });
    withoutAccess.clock.advance(10 * 1000);
    expect(await ask(withoutAccess, { audience: 'admin', deliver: async () => false })).toEqual({ outcome: 'resend_too_soon', retryAfterSeconds: 50 });
  });

  it('decides the delivery with the normalized address', async () => {
    const h = loginCodeHarness();
    const asked: string[] = [];

    await ask(h, { deliver: async (email) => (asked.push(email), true) });

    expect(asked).toEqual(['juana@gmail.com']);
  });

  it('logs every outcome with the address masked', async () => {
    const h = loginCodeHarness();

    await ask(h);
    await ask(h);
    await ask(h, { email: 'nadie@porteros.pro', audience: 'admin', deliver: async () => false });

    expect(h.logs).toEqual([
      { event: 'request', audience: 'app', outcome: 'sent', emailMasked: 'j***@gmail.com' },
      { event: 'request', audience: 'app', outcome: 'resend_too_soon', emailMasked: 'j***@gmail.com' },
      { event: 'request', audience: 'admin', outcome: 'no_access', emailMasked: 'n***@porteros.pro' },
    ]);
    expect(JSON.stringify(h.logs)).not.toContain('100001');
  });
});
