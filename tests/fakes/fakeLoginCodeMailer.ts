import type { EmailSendResult } from '../../src/application/common/email.js';
import type { ILoginCodeMailer, LoginCodeEmail } from '../../src/application/features/auth/common/ports.js';

/** Records every code it was asked to send; answers `next` (sent by default). */
export class FakeLoginCodeMailer implements ILoginCodeMailer {
  readonly sent: LoginCodeEmail[] = [];
  next: EmailSendResult = { outcome: 'sent' };

  async sendLoginCode(email: LoginCodeEmail): Promise<EmailSendResult> {
    this.sent.push(email);
    return this.next;
  }

  /** The last code that went out, as the person reads it in the email. */
  lastCode(): string {
    return this.sent.at(-1)!.code;
  }
}
