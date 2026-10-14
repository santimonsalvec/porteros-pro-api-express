import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { User } from '../../../../../domain/users/user.js';
import type { StaffMember } from '../../../../../domain/staff/staffMember.js';
import { EmailKeyTakenError } from '../../../auth/common/ports.js';
import { verifyLoginCode } from '../../../auth/common/verifyLoginCode.js';
import { adminLoginCodes, type AdminLoginCodeDependencies } from '../../common/adminLoginCodeDependencies.js';
import { startAdminSession } from '../../common/startAdminSession.js';
import { VerifyAdminEmailCodeCommand, type VerifyAdminEmailCodeResult } from './verifyAdminEmailCodeCommand.js';

/**
 * The right code proves the address, as a verified Google email does (admin spec 009, FR-015): an
 * active member enters; a valid invitation becomes active with that address's account, made if
 * needed. Anything else is `invalid_code`, with no account nor session made.
 */
export class VerifyAdminEmailCodeCommandHandler implements ICommandHandler<VerifyAdminEmailCodeCommand, VerifyAdminEmailCodeResult> {
  constructor(private readonly deps: AdminLoginCodeDependencies) {}

  async handle(command: VerifyAdminEmailCodeCommand): Promise<VerifyAdminEmailCodeResult> {
    const verified = await verifyLoginCode(adminLoginCodes(this.deps), { audience: 'admin', email: command.email, code: command.code, ip: command.ip });
    if (verified.outcome !== 'verified') return verified;

    const member = await this.memberFor(verified.email);
    if (!member) {
      verified.log('no_access');
      return { outcome: 'invalid_code' };
    }
    const issued = await startAdminSession(this.deps, member, { userAgent: command.userAgent, ip: command.ip, method: 'email_code' });
    return { outcome: 'signed_in', ...issued };
  }

  private async memberFor(email: string): Promise<StaffMember | null> {
    const member = await this.deps.members.findByEmail(email);
    if (!member) return null;
    if (member.hasAccess()) return member.userId ? member : null;

    const now = this.deps.clock.now();
    if (!member.isInvitationValid(now)) return null;
    const account = await this.accountFor(email);
    if (await this.deps.members.findByUserId(account.id)) return null;
    const active = member.activate(account.id, member.displayName, now);
    await this.deps.members.update(active);
    return active;
  }

  private async accountFor(email: string): Promise<User> {
    const existing = await this.deps.users.findByEmailKey(email);
    if (existing) return existing;
    const user = User.createFromVerifiedEmail({ id: this.deps.ids.newId(), email });
    try {
      await this.deps.users.add(user);
      return user;
    } catch (error) {
      const winner = error instanceof EmailKeyTakenError ? await this.deps.users.findByEmailKey(email) : null;
      if (!winner) throw error;
      return winner;
    }
  }
}
