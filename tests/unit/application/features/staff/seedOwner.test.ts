import { beforeEach, describe, expect, it } from 'vitest';
import { SeedOwnerCommand } from '../../../../../src/application/features/staff/commands/seedOwner/seedOwnerCommand.js';
import { SeedOwnerCommandHandler } from '../../../../../src/application/features/staff/commands/seedOwner/seedOwnerCommandHandler.js';
import { staffHarness } from './staffHarness.js';

describe('SeedOwnerCommandHandler', () => {
  let h: ReturnType<typeof staffHarness>;
  let handler: SeedOwnerCommandHandler;

  beforeEach(() => {
    h = staffHarness();
    handler = new SeedOwnerCommandHandler({ members: h.members, roles: h.roles, ids: h.ids, clock: h.clock });
  });

  it('creates the owner role and an owner invitation for the normalized email', async () => {
    expect(await handler.handle(new SeedOwnerCommand('  Dueno@Example.com '))).toEqual({ outcome: 'created', staffId: 'id-1' });

    expect((await h.roles.getById('owner'))!.system).toBe(true);
    expect(await h.members.findByEmail('dueno@example.com')).toMatchObject({ status: 'invited', roleIds: ['owner'], invitedBy: 'system:script' });
  });

  it('is idempotent', async () => {
    await handler.handle(new SeedOwnerCommand('dueno@example.com'));

    expect(await handler.handle(new SeedOwnerCommand('dueno@example.com'))).toEqual({ outcome: 'unchanged', staffId: 'id-1' });
    expect(h.members.members.size).toBe(1);
  });

  it('promotes an existing member with another role', async () => {
    await h.role('soporte', ['cases.read']);
    await h.activeMember('staff-9', 'dueno@example.com', 'soporte', 'user-9');

    expect(await handler.handle(new SeedOwnerCommand('dueno@example.com'))).toEqual({ outcome: 'promoted', staffId: 'staff-9' });
    expect((await h.members.getById('staff-9'))!.roleIds).toEqual(['owner']);
  });

  it('refuses something that is not an email', async () => {
    expect(await handler.handle(new SeedOwnerCommand('nope'))).toEqual({ outcome: 'invalid_email' });
  });
});
