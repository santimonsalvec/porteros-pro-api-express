import { IQuery } from '../../../../common/mediator/types.js';

export interface PermissionCatalogResponse {
  areas: { id: string; name: string; permissions: { id: string; description: string }[] }[];
}

/** The fixed permission catalog, for the admin web's role screen (contracts/admin-access.md). */
export class GetPermissionCatalogQuery extends IQuery<PermissionCatalogResponse> {}
