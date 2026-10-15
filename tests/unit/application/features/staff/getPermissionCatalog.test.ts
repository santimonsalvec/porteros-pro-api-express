import { describe, expect, it } from 'vitest';
import { GetPermissionCatalogQuery } from '../../../../../src/application/features/staff/queries/getPermissionCatalog/getPermissionCatalogQuery.js';
import { GetPermissionCatalogQueryHandler } from '../../../../../src/application/features/staff/queries/getPermissionCatalog/getPermissionCatalogQueryHandler.js';

describe('GetPermissionCatalogQueryHandler', () => {
  it('lists the areas with their permissions and descriptions, in catalog order', async () => {
    const result = await new GetPermissionCatalogQueryHandler().handle(new GetPermissionCatalogQuery());

    expect(result.areas).toHaveLength(18);
    expect(result.areas[0]).toEqual({
      id: 'team',
      name: 'Equipo',
      permissions: [
        { id: 'staff.read', description: 'Ver los miembros del equipo' },
        { id: 'staff.manage', description: 'Invitar, cambiar el rol y desactivar miembros' },
        { id: 'roles.read', description: 'Ver los roles y sus permisos' },
        { id: 'roles.manage', description: 'Crear, editar y borrar roles' },
        { id: 'audit.read', description: 'Ver el registro de auditoría' },
      ],
    });
    expect(result.areas.at(-1)).toEqual({ id: 'system', name: 'Sistema', permissions: [{ id: 'system.read', description: 'Ver eventos, salud y parámetros del sistema' }] });
  });
});

describe('GetPermissionCatalogQueryHandler: access (admin spec 009)', () => {
  it('has an Acceso area with its own permission for the sign-in code settings', async () => {
    const result = await new GetPermissionCatalogQueryHandler().handle(new GetPermissionCatalogQuery());

    expect(result.areas.find((area) => area.id === 'access')).toEqual({
      id: 'access',
      name: 'Acceso',
      permissions: [{ id: 'access.settings.manage', description: 'Configurar el ingreso con código' }],
    });
  });
});
