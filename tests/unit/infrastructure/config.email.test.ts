import { describe, expect, it } from 'vitest';
import { checkEmailConfig, type EmailConfig } from '../../../src/infrastructure/config.js';

const resend = (extra: Partial<EmailConfig> = {}): EmailConfig => ({ mode: 'resend', apiKey: 're_test', from: undefined, loginCodeTemplateId: 'otp-login', ...extra });

describe('checkEmailConfig (admin spec 009, research §1)', () => {
  it('accepts Resend with its key, with or without a sender', () => {
    expect(() => checkEmailConfig(resend(), 'production')).not.toThrow();
    expect(() => checkEmailConfig(resend({ from: 'PorterosPRO <hola@porteros.pro>' }), 'production')).not.toThrow();
  });

  it('refuses Resend without RESEND_API_KEY', () => {
    expect(() => checkEmailConfig(resend({ apiKey: undefined }), 'production')).toThrow(/RESEND_API_KEY/);
    expect(() => checkEmailConfig(resend({ apiKey: '  ' }), 'development')).toThrow(/RESEND_API_KEY/);
  });

  it('allows the log mode only outside production', () => {
    expect(() => checkEmailConfig(resend({ mode: 'log', apiKey: undefined }), 'development')).not.toThrow();
    expect(() => checkEmailConfig(resend({ mode: 'log' }), 'production')).toThrow(/EMAIL_MODE/);
  });

  it('refuses an unknown mode and an empty template id', () => {
    expect(() => checkEmailConfig(resend({ mode: 'smtp' as EmailConfig['mode'] }), 'development')).toThrow(/EMAIL_MODE/);
    expect(() => checkEmailConfig(resend({ loginCodeTemplateId: '' }), 'development')).toThrow(/LOGIN_CODE_TEMPLATE_ID/);
  });
});

describe('assertEmailConfig (admin spec 009)', () => {
  it('checks the configuration the API started with', async () => {
    const { assertEmailConfig, config } = await import('../../../src/infrastructure/config.js');
    const original = { ...config.email };
    try {
      Object.assign(config.email, { mode: 'log', apiKey: undefined });
      expect(() => assertEmailConfig()).not.toThrow();
      Object.assign(config.email, { mode: 'resend', apiKey: undefined });
      expect(() => assertEmailConfig()).toThrow(/RESEND_API_KEY/);
    } finally {
      Object.assign(config.email, original);
    }
  });
});
