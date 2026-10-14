import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreateEmailResponse } from 'resend';
import { ResendEmailSender, type ResendEmailsClient } from '../../../../src/infrastructure/email/resendEmailSender.js';

const email = { to: 'juana@gmail.com', templateId: 'otp-login', variables: { OTP_CODE: '042917', EXPIRY_MINUTES: 2 }, idempotencyKey: 'code-1' };

function clientAnswering(answer: CreateEmailResponse | (() => Promise<CreateEmailResponse>)) {
  return { send: vi.fn<ResendEmailsClient['send']>(typeof answer === 'function' ? answer : async () => answer) };
}

const resendError = (name: string, statusCode: number | null) =>
  ({ data: null, error: { name, message: `${name} happened`, statusCode }, headers: null }) as unknown as CreateEmailResponse;

function senderWith(client: ResendEmailsClient, options: { from?: string; timeoutMs?: number } = {}) {
  const warnings: unknown[] = [];
  const sender = new ResendEmailSender({ client, logger: { warn: (entry) => warnings.push(entry) }, ...options });
  return { sender, warnings };
}

afterEach(() => vi.useRealTimers());

describe('ResendEmailSender (admin spec 009, research §1)', () => {
  it('sends the published template with its variables and the idempotency key', async () => {
    const client = clientAnswering({ data: { id: 'email-1' }, error: null, headers: null });

    expect(await senderWith(client).sender.sendTemplate(email)).toEqual({ outcome: 'sent' });
    expect(client.send).toHaveBeenCalledWith(
      { to: ['juana@gmail.com'], template: { id: 'otp-login', variables: { OTP_CODE: '042917', EXPIRY_MINUTES: 2 } } },
      { idempotencyKey: 'code-1' },
    );
  });

  it('passes the configured sender only when there is one', async () => {
    const client = clientAnswering({ data: { id: 'email-1' }, error: null, headers: null });

    await senderWith(client, { from: 'PorterosPRO <hola@porteros.pro>' }).sender.sendTemplate(email);

    expect(client.send.mock.calls[0]![0]).toMatchObject({ from: 'PorterosPRO <hola@porteros.pro>' });
  });

  it('answers rejected when the provider refuses the email (template, variables, sender, key)', async () => {
    for (const name of ['validation_error', 'missing_required_field', 'invalid_from_address', 'not_found', 'invalid_api_key']) {
      const { sender } = senderWith(clientAnswering(resendError(name, 422)));
      expect(await sender.sendTemplate(email)).toEqual({ outcome: 'failed', reason: 'rejected' });
    }
  });

  it('answers transient for a rate limit, a server error or a network failure', async () => {
    expect(await senderWith(clientAnswering(resendError('rate_limit_exceeded', 429))).sender.sendTemplate(email)).toEqual({ outcome: 'failed', reason: 'transient' });
    expect(await senderWith(clientAnswering(resendError('internal_server_error', 500))).sender.sendTemplate(email)).toEqual({ outcome: 'failed', reason: 'transient' });
    expect(await senderWith(clientAnswering(() => Promise.reject(new TypeError('fetch failed')))).sender.sendTemplate(email)).toEqual({
      outcome: 'failed',
      reason: 'transient',
    });
  });

  it('gives up after the timeout and answers transient', async () => {
    vi.useFakeTimers();
    const client = { send: vi.fn<ResendEmailsClient['send']>(() => new Promise<never>(() => undefined)) };
    const pending = senderWith(client, { timeoutMs: 10_000 }).sender.sendTemplate(email);

    await vi.advanceTimersByTimeAsync(10_000);

    expect(await pending).toEqual({ outcome: 'failed', reason: 'transient' });
  });

  it('logs a failure with the masked address, never the code nor the key', async () => {
    const { sender, warnings } = senderWith(clientAnswering(resendError('validation_error', 422)));

    await sender.sendTemplate(email);

    const logged = JSON.stringify(warnings);
    expect(logged).toContain('j***@gmail.com');
    expect(logged).toContain('validation_error');
    expect(logged).not.toContain('042917');
    expect(logged).not.toContain('juana@gmail.com');
  });
});
