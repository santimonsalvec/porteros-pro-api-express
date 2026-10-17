import { describe, expect, it, vi } from 'vitest';
import type { IEmailSender } from '../../../../src/application/common/email.js';
import { TemplateLoginCodeMailer } from '../../../../src/infrastructure/email/templateLoginCodeMailer.js';
import { RecordingEmailSender } from '../../../fakes/recordingEmailSender.js';

describe('TemplateLoginCodeMailer (admin spec 009, FR-003)', () => {
  it('sends the otp-login template with OTP_CODE and EXPIRY_MINUTES', async () => {
    const sender = { sendTemplate: vi.fn<IEmailSender['sendTemplate']>().mockResolvedValue({ outcome: 'sent' }) };

    const result = await new TemplateLoginCodeMailer(sender, 'otp-login').sendLoginCode({
      to: 'juana@gmail.com',
      code: '042917',
      expiryMinutes: 2,
      idempotencyKey: 'code-1',
      language: 'es',
    });

    expect(result).toEqual({ outcome: 'sent' });
    expect(sender.sendTemplate).toHaveBeenCalledWith({
      to: 'juana@gmail.com',
      templateId: 'otp-login',
      variables: { OTP_CODE: '042917', EXPIRY_MINUTES: 2, LANGUAGE: 'es' },
      idempotencyKey: 'code-1',
    });
  });

  it('keeps the leading zero of the code: it is text, never a number', async () => {
    const sender = { sendTemplate: vi.fn<IEmailSender['sendTemplate']>().mockResolvedValue({ outcome: 'sent' }) };

    await new TemplateLoginCodeMailer(sender, 'otp-login').sendLoginCode({ to: 'a@b.co', code: '000123', expiryMinutes: 5, idempotencyKey: 'k', language: 'es' });

    expect(sender.sendTemplate.mock.calls[0]![0].variables.OTP_CODE).toBe('000123');
  });

  it('always sends LANGUAGE, so the provider-hosted template picks its texts (feature 032)', async () => {
    const sender = new RecordingEmailSender();

    await new TemplateLoginCodeMailer(sender, 'otp-login').sendLoginCode({ to: 'a@b.co', code: '123456', expiryMinutes: 2, idempotencyKey: 'k', language: 'en' });

    expect(sender.sent[0]!.variables).toEqual({ OTP_CODE: '123456', EXPIRY_MINUTES: 2, LANGUAGE: 'en' });
    await expect(sender.sendTemplate({ to: 'a@b.co', templateId: 'otp-login', variables: { OTP_CODE: '1' }, idempotencyKey: 'k2' })).rejects.toThrow(
      'without LANGUAGE',
    );
  });

  it('uses the configured template and hands back the failure as it came', async () => {
    const sender = { sendTemplate: vi.fn<IEmailSender['sendTemplate']>().mockResolvedValue({ outcome: 'failed', reason: 'transient' }) };

    const result = await new TemplateLoginCodeMailer(sender, 'otp-login-v2').sendLoginCode({ to: 'a@b.co', code: '123456', expiryMinutes: 2, idempotencyKey: 'k', language: 'en' });

    expect(result).toEqual({ outcome: 'failed', reason: 'transient' });
    expect(sender.sendTemplate.mock.calls[0]![0].templateId).toBe('otp-login-v2');
  });
});
