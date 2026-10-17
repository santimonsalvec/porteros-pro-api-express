import { withLanguage, type EmailSendResult, type IEmailSender } from '../../application/common/email.js';
import type { ILoginCodeMailer, LoginCodeEmail } from '../../application/features/auth/common/ports.js';

/**
 * The sign-in code email (admin spec 009, FR-003): the provider's `otp-login` template (or
 * `LOGIN_CODE_TEMPLATE_ID`), with `OTP_CODE` as text — a leading zero stays —, `EXPIRY_MINUTES` and
 * `LANGUAGE` (feature 032).
 */
export class TemplateLoginCodeMailer implements ILoginCodeMailer {
  constructor(
    private readonly sender: IEmailSender,
    private readonly templateId: string,
  ) {}

  sendLoginCode(email: LoginCodeEmail): Promise<EmailSendResult> {
    return this.sender.sendTemplate({
      to: email.to,
      templateId: this.templateId,
      variables: withLanguage(email.language, { OTP_CODE: email.code, EXPIRY_MINUTES: email.expiryMinutes }),
      idempotencyKey: email.idempotencyKey,
    });
  }
}
