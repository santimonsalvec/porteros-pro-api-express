import type { EmailSendResult, IEmailSender, TemplateEmail } from '../../application/common/email.js';
import { maskEmail } from '../../domain/common/email.js';
import { logger as defaultLogger } from '../observability/logger.js';

/**
 * `EMAIL_MODE=log` (admin spec 009, research §1): writes the email to the development log instead
 * of sending it, so a sign-in code can be tried locally. The start-up refuses this mode in
 * production (`assertEmailConfig`): it is the one place a code is ever written down.
 */
export class LogEmailSender implements IEmailSender {
  constructor(private readonly logger: { info(entry: object, message: string): void } = defaultLogger) {}

  async sendTemplate(email: TemplateEmail): Promise<EmailSendResult> {
    this.logger.info({ email_mode: 'log', templateId: email.templateId, to: maskEmail(email.to), variables: email.variables }, 'Email (not sent: EMAIL_MODE=log)');
    return { outcome: 'sent' };
  }
}
