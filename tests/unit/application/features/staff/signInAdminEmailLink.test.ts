import { describe, expect, it } from 'vitest';
import { SignInAdminCommand } from '../../../../../src/application/features/staff/commands/signInAdmin/signInAdminCommand.js';
import { SignInAdminCommandHandler } from '../../../../../src/application/features/staff/commands/signInAdmin/signInAdminCommandHandler.js';
import { User } from '../../../../../src/domain/users/user.js';
import { StaffMember } from '../../../../../src/domain/staff/staffMember.js';
import { staffHarness } from './staffHarness.js';

describe('SignInAdminCommandHandler: one account per proven email (admin spec 009, Q1)', () => {
  /** A member a sign-in code activated: linked to an account with no Google identity. */
  async function codeMember(h: ReturnType<typeof staffHarness>) {
    await h.roles.ensureOwner(h.clock.now());
    h.users.seed(User.createFromVerifiedEmail({ id: 'code-user', email: 'ana@porteros.pro' }));
    const member = StaffMember.invite({ id: 'staff-1', email: 'ana@porteros.pro', roleId: 'owner', invitedBy: 'x' }, h.clock.now()).activate(
      'code-user',
      null,
      h.clock.now(),
    );
    await h.members.add(member);
  }

  it('lets a member a code activated sign in later with Google, linking the identity', async () => {
    const h = staffHarness();
    await codeMember(h);
    h.credential('google', 'Ana@Porteros.pro', 'sub-ana', true);

    const result = await new SignInAdminCommandHandler(h).handle(new SignInAdminCommand('google', 'Firefox', '1.2.3.4'));

    expect(result.outcome).toBe('signed_in');
    expect((await h.users.findByExternalIdentity('google', 'sub-ana'))?.id).toBe('code-user');
  });

  it('refuses it when Google did not verify the address', async () => {
    const h = staffHarness();
    await codeMember(h);
    h.credential('google', 'ana@porteros.pro', 'sub-ana', false);

    const result = await new SignInAdminCommandHandler(h).handle(new SignInAdminCommand('google', 'Firefox', '1.2.3.4'));

    expect(result.outcome).toBe('unauthorized_admin_account');
    expect(await h.users.findByExternalIdentity('google', 'sub-ana')).toBeNull();
  });

  it('gives an invitation activated with Google the email key of its verified address', async () => {
    const h = staffHarness();
    await h.roles.ensureOwner(h.clock.now());
    await h.members.add(StaffMember.invite({ id: 'staff-2', email: 'luis@porteros.pro', roleId: 'owner', invitedBy: 'x' }, h.clock.now()));
    h.credential('google', 'luis@porteros.pro', 'sub-luis', true);

    await new SignInAdminCommandHandler(h).handle(new SignInAdminCommand('google', 'Firefox', '1.2.3.4'));

    expect((await h.users.findByEmailKey('luis@porteros.pro'))?.findExternalIdentity('google', 'sub-luis')).toBeDefined();
  });
});
