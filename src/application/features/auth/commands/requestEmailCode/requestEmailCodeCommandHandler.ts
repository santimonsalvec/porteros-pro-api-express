import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { requestLoginCode, type LoginCodeDependencies, type RequestLoginCodeResult } from '../../common/requestLoginCode.js';
import { RequestEmailCodeCommand } from './requestEmailCodeCommand.js';

/** In the app every valid address gets its code: the account is made when the code is checked (FR-009). */
export class RequestEmailCodeCommandHandler implements ICommandHandler<RequestEmailCodeCommand, RequestLoginCodeResult> {
  constructor(private readonly deps: LoginCodeDependencies) {}

  handle(command: RequestEmailCodeCommand): Promise<RequestLoginCodeResult> {
    return requestLoginCode(this.deps, { audience: 'app', email: command.email, ip: command.ip, deliver: async () => true });
  }
}
