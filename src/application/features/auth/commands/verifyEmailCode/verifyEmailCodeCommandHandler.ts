import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { User } from '../../../../../domain/users/user.js';
import { issueAppSession, type AppSessionDependencies } from '../../common/issueAppSession.js';
import { EmailKeyTakenError, type IIdGenerator, type IUserRepository } from '../../common/ports.js';
import type { LoginCodeDependencies } from '../../common/requestLoginCode.js';
import { verifyLoginCode } from '../../common/verifyLoginCode.js';
import { VerifyEmailCodeCommand, type VerifyEmailCodeResult } from './verifyEmailCodeCommand.js';

export interface VerifyEmailCodeDependencies extends Pick<LoginCodeDependencies, 'codes' | 'hasher' | 'limiter' | 'clock' | 'log'> {
  users: IUserRepository;
  userIds: IIdGenerator;
  session: AppSessionDependencies;
}

/**
 * The right code proves the address (admin spec 009, FR-013, Q1): it signs in to the account that
 * has it — made with Google or with a code — or makes one. A blocked account is told only after the
 * right code (FR-014), so nobody learns it without the mailbox.
 */
export class VerifyEmailCodeCommandHandler implements ICommandHandler<VerifyEmailCodeCommand, VerifyEmailCodeResult> {
  constructor(private readonly deps: VerifyEmailCodeDependencies) {}

  async handle(command: VerifyEmailCodeCommand): Promise<VerifyEmailCodeResult> {
    const verified = await verifyLoginCode(this.deps, { audience: 'app', email: command.email, code: command.code, ip: command.ip });
    if (verified.outcome !== 'verified') return verified;

    const user = await this.accountFor(verified.email);
    const session = await issueAppSession(this.deps.session, user);
    verified.log(session.outcome === 'success' ? 'signed_in' : 'account_blocked');
    return session;
  }

  private async accountFor(email: string): Promise<User> {
    const existing = await this.deps.users.findByEmailKey(email);
    if (existing) return existing;
    const user = User.createFromVerifiedEmail({ id: this.deps.userIds.newId(), email });
    try {
      await this.deps.users.add(user);
      return user;
    } catch (error) {
      // Two first sign-ins at once: the other one made the account, and this one uses it.
      if (!(error instanceof EmailKeyTakenError)) throw error;
      const winner = await this.deps.users.findByEmailKey(email);
      if (!winner) throw error;
      return winner;
    }
  }
}
