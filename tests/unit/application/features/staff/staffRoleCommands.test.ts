import { beforeEach, describe, expect, it } from 'vitest';
import { CreateStaffRoleCommand } from '../../../../../src/application/features/staff/commands/createStaffRole/createStaffRoleCommand.js';
import { CreateStaffRoleCommandHandler } from '../../../../../src/application/features/staff/commands/createStaffRole/createStaffRoleCommandHandler.js';
import { UpdateStaffRoleCommand } from '../../../../../src/application/features/staff/commands/updateStaffRole/updateStaffRoleCommand.js';
import { UpdateStaffRoleCommandHandler } from '../../../../../src/application/features/staff/commands/updateStaffRole/updateStaffRoleCommandHandler.js';
import { DeleteStaffRoleCommand } from '../../../../../src/application/features/staff/commands/deleteStaffRole/deleteStaffRoleCommand.js';
import { DeleteStaffRoleCommandHandler } from '../../../../../src/application/features/staff/commands/deleteStaffRole/deleteStaffRoleCommandHandler.js';
import { staffHarness } from './staffHarness.js';

describe('role commands (spec 002, US3)', () => {
  let h: ReturnType<typeof staffHarness>;
  let create: CreateStaffRoleCommandHandler;
  let update: UpdateStaffRoleCommandHandler;
  let remove: DeleteStaffRoleCommandHandler;

  beforeEach(async () => {
    h = staffHarness();
    const deps = { members: h.members, roles: h.roles, clock: h.clock, accessResolver: h.resolver };
    create = new CreateStaffRoleCommandHandler(deps);
    update = new UpdateStaffRoleCommandHandler(deps);
    remove = new DeleteStaffRoleCommandHandler(deps);
    await h.roles.ensureOwner(h.clock.now());
  });

  it('creates a role with an id made from its name, adding a suffix when taken', async () => {
    expect(await create.handle(new CreateStaffRoleCommand({ name: 'Soporte N1', description: 'Casos', permissions: ['cases.read'] }))).toMatchObject({
      outcome: 'created',
      role: { id: 'soporte-n1', name: 'Soporte N1', memberCount: 0, system: false },
    });
    await h.roles.upsert((await h.roles.getById('soporte-n1'))!.withChanges({ name: 'Otro nombre', description: '', permissions: [] }, h.clock.now()));

    expect(await create.handle(new CreateStaffRoleCommand({ name: 'Soporte N1', description: '', permissions: [] }))).toMatchObject({
      outcome: 'created',
      role: { id: 'soporte-n1-2' },
    });
  });

  it('refuses a repeated name, the owner id, a name without letters and invalid fields', async () => {
    await create.handle(new CreateStaffRoleCommand({ name: 'Soporte', description: '', permissions: [] }));

    expect(await create.handle(new CreateStaffRoleCommand({ name: 'SOPORTE', description: '', permissions: [] }))).toEqual({ outcome: 'role_name_taken' });
    expect(await create.handle(new CreateStaffRoleCommand({ id: 'owner', name: 'Jefe', description: '', permissions: [] }))).toEqual({
      outcome: 'system_role_immutable',
    });
    expect(await create.handle(new CreateStaffRoleCommand({ name: '!!', description: '', permissions: [] }))).toMatchObject({
      outcome: 'invalid',
      fieldErrors: { name: expect.any(String) },
    });
    expect(await create.handle(new CreateStaffRoleCommand({ name: 'Ok rol', description: '', permissions: ['users.block'] }))).toMatchObject({
      outcome: 'invalid',
      fieldErrors: { permissions: expect.any(String) },
    });
  });

  it('updates a role and forgets every cached access; never the owner', async () => {
    await create.handle(new CreateStaffRoleCommand({ name: 'Soporte', description: '', permissions: ['cases.read'] }));

    const result = await update.handle(new UpdateStaffRoleCommand('soporte', { name: 'Soporte', description: 'N1', permissions: ['cases.read', 'cases.resolve'] }));

    expect(result).toMatchObject({ outcome: 'updated', role: { permissions: ['cases.read', 'cases.resolve'], description: 'N1' } });
    expect(h.invalidated).toContain(undefined);
    expect(await update.handle(new UpdateStaffRoleCommand('owner', { name: 'X', description: '', permissions: [] }))).toEqual({ outcome: 'system_role_immutable' });
    expect(await update.handle(new UpdateStaffRoleCommand('nope', { name: 'X x', description: '', permissions: [] }))).toEqual({ outcome: 'role_not_found' });
  });

  it('refuses to rename onto another role name', async () => {
    await create.handle(new CreateStaffRoleCommand({ name: 'Soporte', description: '', permissions: [] }));
    await create.handle(new CreateStaffRoleCommand({ name: 'Finanzas', description: '', permissions: [] }));

    expect(await update.handle(new UpdateStaffRoleCommand('finanzas', { name: 'soporte', description: '', permissions: [] }))).toEqual({
      outcome: 'role_name_taken',
    });
  });

  it('deletes a role without members only', async () => {
    await create.handle(new CreateStaffRoleCommand({ name: 'Soporte', description: '', permissions: [] }));
    await h.activeMember('staff-1', 'ana@example.com', 'soporte', 'user-1');
    await create.handle(new CreateStaffRoleCommand({ name: 'Vacío', description: '', permissions: [] }));

    expect(await remove.handle(new DeleteStaffRoleCommand('soporte'))).toEqual({ outcome: 'role_in_use', memberCount: 1 });
    expect(await remove.handle(new DeleteStaffRoleCommand('owner'))).toEqual({ outcome: 'system_role_immutable' });
    expect(await remove.handle(new DeleteStaffRoleCommand('nope'))).toEqual({ outcome: 'role_not_found' });
    expect(await remove.handle(new DeleteStaffRoleCommand('vacio'))).toEqual({ outcome: 'deleted' });
    expect(await h.roles.getById('vacio')).toBeNull();
  });

  it('gives a role named like the owner the next free id', async () => {
    expect(await create.handle(new CreateStaffRoleCommand({ name: 'Owner', description: '', permissions: [] }))).toMatchObject({
      outcome: 'created',
      role: { id: 'owner-2' },
    });
  });

  it('refuses an edit with invalid fields', async () => {
    await create.handle(new CreateStaffRoleCommand({ name: 'Soporte', description: '', permissions: [] }));

    expect(await update.handle(new UpdateStaffRoleCommand('soporte', { name: 'S', description: '', permissions: [] }))).toMatchObject({
      outcome: 'invalid',
      fieldErrors: { name: expect.any(String) },
    });
  });
});
