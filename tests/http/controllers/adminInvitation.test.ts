import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { seedRole } from '../adminTestHelpers.js';
import { ExternalIdentity } from '../../../src/domain/users/externalIdentity.js';
import { InviteStaffMemberCommand } from '../../../src/application/features/staff/commands/inviteStaffMember/inviteStaffMemberCommand.js';
import { SetStaffMemberStatusCommand } from '../../../src/application/features/staff/commands/setStaffMemberStatus/setStaffMemberStatusCommand.js';
import type { TestApp } from '../walletTestHelpers.js';
import { SCRIPT_ACTOR } from '../../../src/domain/staff/staffActor.js';

const DAY = 24 * 60 * 60 * 1000;

async function invite(context: TestApp): Promise<string> {
  await seedRole(context, 'soporte', ['cases.read']);
  const result = await context.mediator.send(new InviteStaffMemberCommand('ana@example.com', 'soporte', SCRIPT_ACTOR));
  context.googleValidator.registerValidAdminCredential('cred-ana', new ExternalIdentity('google', 'sub-ana', 'ana@example.com'), true, 'Ana');
  return (result as { staffId: string }).staffId;
}

describe('a guest signs in for the first time (spec 001, US4)', () => {
  it("enters with the invited role's permissions", async () => {
    const context = await buildTestApp();
    await invite(context);

    const signIn = await request(context.app).post('/auth/admin/sign-in').send({ credential: 'cred-ana' });
    const me = await request(context.app).get('/admin/me').set('Authorization', `Bearer ${signIn.body.accessToken}`);

    expect(signIn.status).toBe(200);
    expect(me.body).toMatchObject({ email: 'ana@example.com', displayName: 'Ana', role: { id: 'soporte' }, permissions: ['cases.read'] });
  });

  it('is refused once the invitation is older than 7 days', async () => {
    const context = await buildTestApp();
    await invite(context);
    context.clock.advance(8 * DAY);

    const response = await request(context.app).post('/auth/admin/sign-in').send({ credential: 'cred-ana' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('unauthorized_admin_account');
  });

  it('is refused once disabled', async () => {
    const context = await buildTestApp();
    const staffId = await invite(context);
    await context.mediator.send(new SetStaffMemberStatusCommand(staffId, 'disabled', SCRIPT_ACTOR));

    expect((await request(context.app).post('/auth/admin/sign-in').send({ credential: 'cred-ana' })).status).toBe(403);
  });
});
