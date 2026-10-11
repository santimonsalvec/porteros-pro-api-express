import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { PERMISSION_AREAS } from '../../../../../domain/staff/permissionCatalog.js';
import { GetPermissionCatalogQuery, type PermissionCatalogResponse } from './getPermissionCatalogQuery.js';

export class GetPermissionCatalogQueryHandler implements IQueryHandler<GetPermissionCatalogQuery, PermissionCatalogResponse> {
  async handle(_query: GetPermissionCatalogQuery): Promise<PermissionCatalogResponse> {
    return {
      areas: PERMISSION_AREAS.map((area) => ({
        id: area.id,
        name: area.name,
        permissions: area.permissions.map((permission) => ({ id: permission.id, description: permission.description })),
      })),
    };
  }
}
