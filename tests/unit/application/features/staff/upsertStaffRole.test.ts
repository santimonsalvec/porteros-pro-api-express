import { beforeEach, describe, expect, it } from 'vitest';
import { UpsertStaffRoleCommand } from '../../../../../src/application/features/staff/commands/upsertStaffRole/upsertStaffRoleCommand.js';
import { UpsertStaffRoleCommandHandler } from '../../../../../src/application/features/staff/commands/upsertStaffRole/upsertStaffRoleCommandHandler.js';
import { staffHarness } from './staffHarness.js';

describe('UpsertStaffRoleCommandHandler', () => {
  let h: ReturnType<typeof staffHarness>;
  let handler: UpsertStaffRoleCommandHandler;
  const upsert = (id: string, permissions: string[], name = 'Soporte') =>
    handler.handle(new UpsertStaffRoleCommand({ id, name, description: '', permissions }));

  beforeEach(async () => {
    h = staffHarness();
    handler = new UpsertStaffRoleCommandHandler({ roles: h.roles, clock: h.clock, accessResolver: h.resolver });
    await h.roles.ensureOwner(h.clock.now());
  });

  it('creates a custom role, then updates it and forgets every cached access', async () => {
    expect(await upsert('soporte', ['cases.read'])).toEqual({ outcome: 'created' });
    expect(await upsert('soporte', ['cases.read', 'cases.resolve'], 'Soporte N1')).toEqual({ outcome: 'updated' });

    expect(await h.roles.getById('soporte')).toMatchObject({ name: 'Soporte N1', permissions: ['cases.read', 'cases.resolve'] });
    expect(h.invalidated).toEqual([undefined, undefined]);
  });

  it('never touches the owner role', async () => {
    expect(await upsert('owner', [])).toEqual({ outcome: 'system_role_immutable' });
  });

  it('reports invalid fields', async () => {
    expect(await upsert('soporte', ['users.block'])).toEqual({ outcome: 'invalid', fieldErrors: { permissions: expect.any(String) } });
  });
});
