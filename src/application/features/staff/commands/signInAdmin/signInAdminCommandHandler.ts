import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { AdminGoogleIdentity, IGoogleIdTokenValidator, IIdGenerator, IUserRepository } from '../../../auth/common/ports.js';
import { User } from '../../../../../domain/users/user.js';
import { AdminSession } from '../../../../../domain/staff/adminSession.js';
import { normalizeStaffEmail, type StaffMember } from '../../../../../domain/staff/staffMember.js';
import type { IAdminSecurityLog, IAdminSessionStore, IAdminTokenIssuer, IStaffMemberRepository } from '../../common/ports.js';
import { toSessionSummary } from '../../common/sessionResponse.js';
import { SignInAdminCommand, type SignInAdminResult } from './signInAdminCommand.js';

export interface SignInAdminDependencies {
  google: IGoogleIdTokenValidator;
  users: IUserRepository;
  members: IStaffMemberRepository;
  sessions: IAdminSessionStore;
  tokens: IAdminTokenIssuer;
  ids: IIdGenerator;
  clock: IClock;
  securityLog: IAdminSecurityLog;
}

/**
 * Opens an admin web session for a staff member: the Google account must be the one linked to the
 * member. Every refusal is the same `unauthorized_admin_account`, so it never tells whether an
 * email belongs to the team; no account nor session is created on a refusal.
 */
export class SignInAdminCommandHandler implements ICommandHandler<SignInAdminCommand, SignInAdminResult> {
  constructor(private readonly deps: SignInAdminDependencies) {}

  async handle(command: SignInAdminCommand): Promise<SignInAdminResult> {
    const google = await this.deps.google.validateForAdmin(command.credential);
    if (!google) {
      this.deps.securityLog.log({ event: 'admin_sign_in', outcome: 'invalid_credential' });
      return { outcome: 'invalid_credential' };
    }

    const member = await this.authorizedMember(google);
    if (!member) {
      this.deps.securityLog.log({ event: 'admin_sign_in', outcome: 'unauthorized_admin_account' });
      return { outcome: 'unauthorized_admin_account' };
    }

    const now = this.deps.clock.now();
    await this.deps.members.update(member.recordSignIn(now));
    const refreshToken = this.deps.tokens.newRefreshToken();
    const session = AdminSession.start(
      {
        id: this.deps.ids.newId(),
        staffId: member.id,
        userId: member.userId!,
        refreshTokenHash: this.deps.tokens.hashRefreshToken(refreshToken),
        userAgent: command.userAgent,
        ip: command.ip,
      },
      now,
    );
    await this.deps.sessions.add(session);
    const access = await this.deps.tokens.issueAccessToken({ userId: session.userId, sessionId: session.id, staffId: member.id });

    this.deps.securityLog.log({ event: 'admin_sign_in', outcome: 'signed_in', staffId: member.id, sessionId: session.id });
    return { outcome: 'signed_in', ...access, refreshToken, session: toSessionSummary(session) };
  }

  /**
   * The member this Google sign-in may enter as: an active member whose linked account is this
   * identity, or a valid invitation for this verified email — activated now, creating the account
   * when the person never used the app. Null for anything else.
   */
  private async authorizedMember(google: AdminGoogleIdentity): Promise<StaffMember | null> {
    const email = normalizeStaffEmail(google.identity.email);
    const member = email ? await this.deps.members.findByEmail(email) : null;
    if (!member) return null;
    const user = await this.deps.users.findByExternalIdentity(google.identity.provider, google.identity.subject);

    if (member.hasAccess()) return member.userId !== null && user?.id === member.userId ? member : null;

    const now = this.deps.clock.now();
    if (!member.isInvitationValid(now) || !google.emailVerified) return null;
    if (user && (await this.deps.members.findByUserId(user.id))) return null;

    const account = user ?? (await this.createAccount(google, email!));
    const active = member.activate(account.id, google.displayName, now);
    await this.deps.members.update(active);
    return active;
  }

  private async createAccount(google: AdminGoogleIdentity, email: string): Promise<User> {
    const user = User.createFromExternalIdentity({
      id: this.deps.ids.newId(),
      email,
      displayName: null,
      provider: google.identity.provider,
      subject: google.identity.subject,
    });
    await this.deps.users.add(user);
    return user;
  }
}
