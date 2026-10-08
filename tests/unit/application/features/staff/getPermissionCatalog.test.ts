import { describe, expect, it } from 'vitest';
import { GetPermissionCatalogQuery } from '../../../../../src/application/features/staff/queries/getPermissionCatalog/getPermissionCatalogQuery.js';
import { GetPermissionCatalogQueryHandler } from '../../../../../src/application/features/staff/queries/getPermissionCatalog/getPermissionCatalogQueryHandler.js';

describe('GetPermissionCatalogQueryHandler', () => {
  it('lists the areas with their permissions and descriptions, in catalog order', async () => {
    const result = await new GetPermissionCatalogQueryHandler().handle(new GetPermissionCatalogQuery());

    expect(result.areas).toHaveLength(16);
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
