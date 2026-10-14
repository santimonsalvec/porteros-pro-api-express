import { Resend, type CreateEmailOptions, type CreateEmailRequestOptions, type CreateEmailResponse } from 'resend';
import type { EmailSendResult, IEmailSender, TemplateEmail } from '../../application/common/email.js';
import { maskEmail } from '../../domain/common/email.js';
import { logger as defaultLogger } from '../observability/logger.js';

/** The part of the Resend SDK this adapter uses, so the tests hand in their own. */
export interface ResendEmailsClient {
  send(payload: CreateEmailOptions, options?: CreateEmailRequestOptions): Promise<CreateEmailResponse>;
}

export interface ResendEmailSenderOptions {
  /** Read from `RESEND_API_KEY`; ignored when `client` is given. */
  apiKey?: string;
  client?: ResendEmailsClient;
  /** Overrides the template's sender (`EMAIL_FROM`); the template's own when absent. */
  from?: string;
  timeoutMs?: number;
  logger?: { warn(entry: object, message: string): void };
}

const DEFAULT_TIMEOUT_MS = 10_000;

/** The SDK's error names that a retry will not fix: the email itself, its template or the account. */
const REJECTED = new Set([
  'validation_error',
  'missing_required_field',
  'invalid_parameter',
  'invalid_from_address',
  'invalid_attachment',
  'invalid_region',
  'not_found',
  'method_not_allowed',
  'missing_api_key',
  'invalid_api_key',
  'restricted_api_key',
  'invalid_access',
  'security_error',
  'invalid_idempotency_key',
  'invalid_idempotent_request',
  'daily_quota_exceeded',
  'monthly_quota_exceeded',
]);

class EmailTimeout extends Error {}

/**
 * Resend as the email provider (admin spec 009, research §1): a published template, its variables,
 * and the idempotency key, so a retried call never sends twice. The SDK answers `{ data, error }`
 * instead of throwing; a throw is the network. Every call gives up after 10 s.
 */
export class ResendEmailSender implements IEmailSender {
  private readonly client: ResendEmailsClient;
  private readonly from: string | undefined;
  private readonly timeoutMs: number;
  private readonly logger: NonNullable<ResendEmailSenderOptions['logger']>;

  constructor(options: ResendEmailSenderOptions) {
    this.client = options.client ?? new Resend(options.apiKey).emails;
    this.from = options.from;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.logger = options.logger ?? defaultLogger;
  }

  async sendTemplate(email: TemplateEmail): Promise<EmailSendResult> {
    const payload: CreateEmailOptions = {
      ...(this.from ? { from: this.from } : {}),
      to: [email.to],
      template: { id: email.templateId, variables: email.variables },
    };
    const failed = (reason: 'transient' | 'rejected', cause: string): EmailSendResult => {
      this.logger.warn({ audit: 'email_send_failed', provider: 'resend', templateId: email.templateId, to: maskEmail(email.to), reason, cause }, 'Email not sent');
      return { outcome: 'failed', reason };
    };

    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new EmailTimeout()), this.timeoutMs);
      });
      const response = await Promise.race([this.client.send(payload, { idempotencyKey: email.idempotencyKey }), timeout]);
      if (!response.error) return { outcome: 'sent' };
      const { name, statusCode } = response.error;
      const transient = !REJECTED.has(name) || (statusCode !== null && statusCode >= 500);
      return failed(transient ? 'transient' : 'rejected', name);
    } catch (error) {
      return failed('transient', error instanceof EmailTimeout ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
  }
}
