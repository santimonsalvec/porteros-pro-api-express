import { describe, expect, it } from 'vitest';
import { PERMISSION_CATALOG } from '../../../../src/domain/staff/permissionCatalog.js';
import {
  OWNER_ROLE_ID,
  slugFromName,
  StaffRole,
  SystemRoleImmutableError,
  validateStaffRoleInput,
} from '../../../../src/domain/staff/staffRole.js';

const NOW = new Date('2026-10-08T14:00:00.000Z');
const LATER = new Date('2026-10-09T14:00:00.000Z');

describe('StaffRole', () => {
  it('the owner role is a system role whose effective permissions are the whole catalog', () => {
    const owner = StaffRole.owner(NOW);

    expect(owner.id).toBe(OWNER_ROLE_ID);
    expect(owner.name).toBe('Dueño');
    expect(owner.system).toBe(true);
    expect(owner.isOwner).toBe(true);
    expect(owner.permissions).toEqual([]);
    expect(owner.effectivePermissions()).toEqual([...PERMISSION_CATALOG]);
  });

  it("a custom role's effective permissions are its catalog permissions, in catalog order", () => {
    const role = StaffRole.rehydrate({
      id: 'soporte',
      name: 'Soporte',
      description: '',
      permissions: ['cases.resolve', 'retired.permission', 'cases.read'],
      system: false,
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(role.isOwner).toBe(false);
    expect(role.effectivePermissions()).toEqual(['cases.read', 'cases.resolve']);
  });

  it('creates a custom role with trimmed fields', () => {
    const role = StaffRole.create({ id: 'soporte', name: '  Soporte  ', description: ' Atiende casos ', permissions: ['cases.read'] }, NOW);

    expect(role).toMatchObject({ id: 'soporte', name: 'Soporte', description: 'Atiende casos', system: false, createdAt: NOW });
  });

  it('validates id, name, description and permissions field by field', () => {
    expect(validateStaffRoleInput({ id: 'soporte', name: 'Soporte', description: '', permissions: ['cases.read'] })).toEqual({});
    expect(
      validateStaffRoleInput({
        id: 'Soporte!',
        name: 'S',
        description: 'x'.repeat(301),
        permissions: ['cases.read', 'cases.read'],
      }),
    ).toEqual({
      id: expect.any(String),
      name: expect.any(String),
      description: expect.any(String),
      permissions: expect.any(String),
    });
    expect(validateStaffRoleInput({ id: 'owner', name: 'Otro', description: '', permissions: [] })).toEqual({ id: expect.any(String) });
    expect(validateStaffRoleInput({ id: 'ok', name: 'Ok', description: '', permissions: ['users.block'] })).toEqual({
      permissions: expect.any(String),
    });
    expect(validateStaffRoleInput({ id: 'ok', name: 'x'.repeat(61), description: '', permissions: [] })).toEqual({ name: expect.any(String) });
  });

  it('refuses to create an invalid role', () => {
    expect(() => StaffRole.create({ id: 'owner', name: 'Dueño', description: '', permissions: [] }, NOW)).toThrow();
  });

  it('updates a custom role and refuses to touch a system role', () => {
    const role = StaffRole.create({ id: 'soporte', name: 'Soporte', description: '', permissions: ['cases.read'] }, NOW);

    const updated = role.withChanges({ name: 'Soporte N1', description: 'Primer nivel', permissions: ['cases.read', 'cases.resolve'] }, LATER);

    expect(updated).toMatchObject({ name: 'Soporte N1', permissions: ['cases.read', 'cases.resolve'], createdAt: NOW, updatedAt: LATER });
    expect(() => StaffRole.owner(NOW).withChanges({ name: 'X', description: '', permissions: [] }, LATER)).toThrow(SystemRoleImmutableError);
  });
});

describe('slugFromName', () => {
  it('turns a role name into its id', () => {
    expect(slugFromName('Soporte N1')).toBe('soporte-n1');
    expect(slugFromName('  Finanzas Ñandú ')).toBe('finanzas-nandu');
    expect(slugFromName('Atención  al --- cliente!')).toBe('atencion-al-cliente');
  });

  it('cuts it to 40 characters without a trailing dash', () => {
    const slug = slugFromName('a'.repeat(39) + ' bcd')!;
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('is null when nothing usable is left, or it does not start with a letter', () => {
    expect(slugFromName('!!!')).toBeNull();
    expect(slugFromName('1 rol')).toBeNull();
    expect(slugFromName('a')).toBeNull();
  });
});

