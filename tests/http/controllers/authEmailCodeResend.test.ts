import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

describe('asking for the code again — /auth/email-code (admin spec 009, US2)', () => {
  it('asks to wait 60 s, then sends a new code that replaces the first', async () => {
    const context = await buildTestApp();
    const ask = () => request(context.app).post('/auth/email-code').send({ email: 'juana@gmail.com' });

    await ask();
    const firstCode = context.loginCodeMailer.lastCode();
    context.clock.advance(20 * SECOND);
    const tooSoon = await ask();
    context.clock.advance(40 * SECOND);
    const again = await ask();
    const secondCode = context.loginCodeMailer.lastCode();

    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body).toMatchObject({ error: 'resend_too_soon', retryAfterSeconds: 40 });
    expect(tooSoon.headers['retry-after']).toBe('40');
    expect(again.status).toBe(202);
    expect(secondCode).not.toBe(firstCode);

    const old = await request(context.app).post('/auth/email-code/verify').send({ email: 'juana@gmail.com', code: firstCode });
    const current = await request(context.app).post('/auth/email-code/verify').send({ email: 'juana@gmail.com', code: secondCode });
    expect(old.body.error).toBe('invalid_code');
    expect(current.status).toBe(200);
  });

  it('stops at five codes in an hour and says until when', async () => {
    const context = await buildTestApp();
    const start = context.clock.now();
    for (let send = 0; send < 5; send += 1) {
      context.clock.set(new Date(start.getTime() + send * 10 * MINUTE));
      expect((await request(context.app).post('/auth/email-code').send({ email: 'juana@gmail.com' })).status).toBe(202);
    }
    context.clock.set(new Date(start.getTime() + 50 * MINUTE));

    const response = await request(context.app).post('/auth/email-code').send({ email: 'juana@gmail.com' });

    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({
      error: 'too_many_codes',
      retryAfterSeconds: 600,
      retryAt: new Date(start.getTime() + 60 * MINUTE).toISOString(),
    });
    expect(response.headers['retry-after']).toBe('600');
  });

  it('does not count a send the provider failed', async () => {
    const context = await buildTestApp();
    const ask = () => request(context.app).post('/auth/email-code').send({ email: 'juana@gmail.com' });

    context.loginCodeMailer.next = { outcome: 'failed', reason: 'rejected' };
    expect((await ask()).status).toBe(503);
    context.loginCodeMailer.next = { outcome: 'sent' };
    context.clock.advance(SECOND);

    expect((await ask()).status).toBe(202);
  });
});
