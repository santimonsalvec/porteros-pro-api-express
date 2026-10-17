import type { Language } from '../../domain/i18n/language.js';

/**
 * Sending email through a template the provider hosts (admin spec 009, FR-004). The rules never see
 * which provider: Resend is one adapter of this port (`infrastructure/email`).
 */
export interface TemplateEmail {
  to: string;
  /** The id or alias of a published template. */
  templateId: string;
  variables: Record<string, string | number>;
  /** The same key never sends twice, even if the call is retried. */
  idempotencyKey: string;
}

/**
 * `transient`: try again later (network, rate limit, provider down). `rejected`: the provider
 * refused this email (template, variables, sender, credentials) and retrying will not help.
 */
export type EmailSendResult = { outcome: 'sent' } | { outcome: 'failed'; reason: 'transient' | 'rejected' };

export interface IEmailSender {
  sendTemplate(email: TemplateEmail): Promise<EmailSendResult>;
}

/**
 * Every template send carries `LANGUAGE` (feature 032, contracts/email-template-variables.md): the
 * templates live with the provider, so the language is the only way they pick their texts.
 */
export function withLanguage(language: Language, variables: Record<string, string | number>): Record<string, string | number> {
  return { ...variables, LANGUAGE: language };
}
