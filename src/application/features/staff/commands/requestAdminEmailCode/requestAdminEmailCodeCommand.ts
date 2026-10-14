import { ICommand } from '../../../../common/mediator/types.js';
import type { RequestLoginCodeResult } from '../../../auth/common/requestLoginCode.js';

/** A sign-in code for the admin web (admin spec 009, US3). */
export class RequestAdminEmailCodeCommand extends ICommand<RequestLoginCodeResult> {
  constructor(
    readonly email: string,
    readonly ip: string,
  ) {
    super();
  }
}
