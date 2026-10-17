import type { EmailSendResult, IEmailSender, TemplateEmail } from '../../src/application/common/email.js';

/**
 * Records every template send; answers `next`. It throws when a send carries no `LANGUAGE`, so a
 * template the provider renders can never be sent without its language (feature 032).
 */
export class RecordingEmailSender implements IEmailSender {
  readonly sent: TemplateEmail[] = [];
  next: EmailSendResult = { outcome: 'sent' };

  async sendTemplate(email: TemplateEmail): Promise<EmailSendResult> {
    if (!('LANGUAGE' in email.variables)) throw new Error(`Template ${email.templateId} sent without LANGUAGE`);
    this.sent.push(email);
    return this.next;
  }
}
