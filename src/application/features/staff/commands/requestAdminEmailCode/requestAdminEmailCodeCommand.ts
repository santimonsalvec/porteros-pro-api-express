import { ICommand } from '../../../../common/mediator/types.js';
import type { Language } from '../../../../../domain/i18n/language.js';
import type { RequestLoginCodeResult } from '../../../auth/common/requestLoginCode.js';

/** A sign-in code for the admin web (admin spec 009, US3). */
export class RequestAdminEmailCodeCommand extends ICommand<RequestLoginCodeResult> {
  constructor(
    readonly email: string,
    readonly ip: string,
    /** The call's `Accept-Language` (feature 032); the email's language when the account has none. */
    readonly requestLanguage: Language | null = null,
  ) {
    super();
  }
}
