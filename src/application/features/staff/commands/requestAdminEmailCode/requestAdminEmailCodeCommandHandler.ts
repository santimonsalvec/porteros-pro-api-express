import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { requestLoginCode, type RequestLoginCodeResult } from '../../../auth/common/requestLoginCode.js';
import { adminLoginCodes, type AdminLoginCodeDependencies } from '../../common/adminLoginCodeDependencies.js';
import { withResponseFloor } from '../../common/responseFloor.js';
import { RequestAdminEmailCodeCommand } from './requestAdminEmailCodeCommand.js';

/**
 * Only an active member or a valid invitation gets a code, but every address gets the same answer
 * in no less than the floor, so asking never tells who is on the team (FR-009, SC-007).
 */
export class RequestAdminEmailCodeCommandHandler implements ICommandHandler<RequestAdminEmailCodeCommand, RequestLoginCodeResult> {
  constructor(private readonly deps: AdminLoginCodeDependencies) {}

  handle(command: RequestAdminEmailCodeCommand): Promise<RequestLoginCodeResult> {
    return withResponseFloor(this.deps.timer, this.deps.minResponseMs, () =>
      requestLoginCode(adminLoginCodes(this.deps), {
        audience: 'admin',
        email: command.email,
        ip: command.ip,
        deliver: async (email) => {
          const member = await this.deps.members.findByEmail(email);
          return member !== null && (member.hasAccess() || member.isInvitationValid(this.deps.clock.now()));
        },
      }),
    );
  }
}
