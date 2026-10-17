import { ICommand } from '../../../../common/mediator/types.js';
import type { Language } from '../../../../../domain/i18n/language.js';
import type { RequestLoginCodeResult } from '../../common/requestLoginCode.js';

/** A sign-in code for the app, sent to this address (admin spec 009, US1). */
export class RequestEmailCodeCommand extends ICommand<RequestLoginCodeResult> {
  constructor(
    readonly email: string,
    readonly ip: string,
    /** The call's `Accept-Language` (feature 032); the email's language when the account has none. */
    readonly requestLanguage: Language | null = null,
  ) {
    super();
  }
}
