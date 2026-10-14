import { describe, expect, it } from 'vitest';
import { LogEmailSender } from '../../../../src/infrastructure/email/logEmailSender.js';
import { ResendEmailSender } from '../../../../src/infrastructure/email/resendEmailSender.js';

describe('LogEmailSender (admin spec 009, EMAIL_MODE=log)', () => {
  it('writes the email to the development log with the address masked, and counts it as sent', async () => {
    const lines: object[] = [];
    const sender = new LogEmailSender({ info: (entry) => lines.push(entry) });

    const result = await sender.sendTemplate({ to: 'juana@gmail.com', templateId: 'otp-login', variables: { OTP_CODE: '042917', EXPIRY_MINUTES: 2 }, idempotencyKey: 'k' });

    expect(result).toEqual({ outcome: 'sent' });
    expect(lines).toEqual([{ email_mode: 'log', templateId: 'otp-login', to: 'j***@gmail.com', variables: { OTP_CODE: '042917', EXPIRY_MINUTES: 2 } }]);
  });

  it('logs with the API logger by default', async () => {
    expect(await new LogEmailSender().sendTemplate({ to: 'a@b.co', templateId: 't', variables: {}, idempotencyKey: 'k' })).toEqual({ outcome: 'sent' });
  });
});

describe('ResendEmailSender defaults (admin spec 009)', () => {
  it('builds the Resend client from the key when none is given', () => {
    expect(() => new ResendEmailSender({ apiKey: 're_test_only' })).not.toThrow();
  });
});
