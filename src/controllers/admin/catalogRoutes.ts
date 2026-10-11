import type { Request, Response } from 'express';
import type { ISender } from '../../application/common/mediator/types.js';
import { DeleteDocumentTypeCommand } from '../../application/features/geography/commands/deleteDocumentType/deleteDocumentTypeCommand.js';
import { DeleteMatchSurfaceCommand } from '../../application/features/geography/commands/deleteMatchSurface/deleteMatchSurfaceCommand.js';
import { SaveDocumentTypeCommand, type SaveDocumentTypeResult } from '../../application/features/geography/commands/saveDocumentType/saveDocumentTypeCommand.js';
import { SaveMatchSurfaceCommand, type SaveMatchSurfaceResult } from '../../application/features/geography/commands/saveMatchSurface/saveMatchSurfaceCommand.js';
import { GetDocumentTypeQuery } from '../../application/features/geography/queries/getDocumentType/getDocumentTypeQuery.js';
import { GetMatchSurfaceQuery } from '../../application/features/geography/queries/getMatchSurface/getMatchSurfaceQuery.js';
import { ListDocumentTypesQuery } from '../../application/features/geography/queries/listDocumentTypes/listDocumentTypesQuery.js';
import { ListMatchSurfacesQuery } from '../../application/features/geography/queries/listMatchSurfaces/listMatchSurfacesQuery.js';
import { ApiError } from '../apiError.js';
import {
  createDocumentTypeRequestSchema,
  createMatchSurfaceRequestSchema,
  deleteRequestSchema,
  listDocumentTypesQuerySchema,
  listMatchSurfacesQuerySchema,
  updateDocumentTypeRequestSchema,
  updateMatchSurfaceRequestSchema,
} from '../requests/geography/geographyRequests.js';
import { conflict, invalidFields, notFound, parse, sendDeleted, stale, warningsUnacknowledged, type Route } from './geographyRoutes.js';

/**
 * Document types and match surfaces in the admin web (spec 003 of the admin,
 * contracts/geography-api.md): read with `geography.read`, written with `catalogs.manage`.
 */
export function registerCatalogRoutes(route: Route, mediator: ISender): void {
  registerDocumentTypeRoutes(route, mediator);
  registerMatchSurfaceRoutes(route, mediator);
}

const param = (req: Request, name: string) => String(req.params[name]);

function registerDocumentTypeRoutes(route: Route, mediator: ISender): void {
  const view = async (documentTypeId: string) => {
    const result = await mediator.send(new GetDocumentTypeQuery(documentTypeId));
    if (result.outcome === 'not_found') throw notFound('document_type_not_found');
    return result.documentType;
  };
  const audit = (action: string) => ({
    permission: 'catalogs.manage' as const,
    audit: {
      action,
      resourceType: 'documentType',
      resourceId: (req: Request) => param(req, 'documentTypeId'),
      before: async (req: Request) => {
        const result = await mediator.send(new GetDocumentTypeQuery(param(req, 'documentTypeId')));
        return result.outcome === 'ok' ? result.documentType : null;
      },
    },
  });
  const sendSaved = async (res: Response, result: SaveDocumentTypeResult) => {
    switch (result.outcome) {
      case 'saved':
        res.locals.auditResourceId = result.documentTypeId;
        res.status(result.created ? 201 : 200).json(await view(result.documentTypeId));
        return;
      case 'not_found':
        throw notFound('document_type_not_found');
      case 'stale':
        throw stale();
      case 'document_type_code_taken':
        throw new ApiError(409, 'document_type_code_taken', 'Another document type already has this code.', { code: 'Another document type already has this code.' });
      case 'document_type_code_in_use':
        throw conflict('document_type_code_in_use', 'Goalkeepers use this code; it cannot change.');
      case 'warnings':
        throw warningsUnacknowledged(result.warnings);
    }
  };

  route('get', '/document-types', 'geography.read', async (req, res) => {
    const { page, pageSize, ...filters } = parse(listDocumentTypesQuerySchema, req.query);
    res.status(200).json(await mediator.send(new ListDocumentTypesQuery(filters, page, pageSize)));
  });

  route('get', '/document-types/:documentTypeId', 'geography.read', async (req, res) => {
    res.status(200).json(await view(req.params.documentTypeId));
  });

  route(
    'post',
    '/document-types',
    { permission: 'catalogs.manage', audit: { action: 'documentType.create', resourceType: 'documentType', resourceId: () => 'new' } },
    async (req, res) => {
      const { acknowledgeWarnings, ...fields } = parse(createDocumentTypeRequestSchema, req.body);
      await sendSaved(res, await mediator.send(SaveDocumentTypeCommand.create(fields, acknowledgeWarnings)));
    },
  );

  route('patch', '/document-types/:documentTypeId', audit('documentType.update'), async (req, res) => {
    const { revision, acknowledgeWarnings, ...changes } = parse(updateDocumentTypeRequestSchema, req.body);
    await sendSaved(res, await mediator.send(SaveDocumentTypeCommand.edit(req.params.documentTypeId, revision, changes, acknowledgeWarnings)));
  });

  route('post', '/document-types/:documentTypeId/delete', audit('documentType.delete'), async (req, res) => {
    parse(deleteRequestSchema, req.body);
    sendDeleted(res, await mediator.send(new DeleteDocumentTypeCommand(req.params.documentTypeId)), 'document_type_not_found');
  });
}

function registerMatchSurfaceRoutes(route: Route, mediator: ISender): void {
  const view = async (surfaceId: string) => {
    const result = await mediator.send(new GetMatchSurfaceQuery(surfaceId));
    if (result.outcome === 'not_found') throw notFound('surface_not_found');
    return result.surface;
  };
  const audit = (action: string) => ({
    permission: 'catalogs.manage' as const,
    audit: {
      action,
      resourceType: 'matchSurface',
      resourceId: (req: Request) => param(req, 'surfaceId'),
      before: async (req: Request) => {
        const result = await mediator.send(new GetMatchSurfaceQuery(param(req, 'surfaceId')));
        return result.outcome === 'ok' ? result.surface : null;
      },
    },
  });
  const sendSaved = async (res: Response, result: SaveMatchSurfaceResult) => {
    switch (result.outcome) {
      case 'saved':
        res.locals.auditResourceId = result.surfaceId;
        res.status(result.created ? 201 : 200).json(await view(result.surfaceId));
        return;
      case 'not_found':
        throw notFound('surface_not_found');
      case 'stale':
        throw stale();
      case 'reason_required':
        throw invalidFields({ reason: 'A reason of 3–300 characters is required.' });
    }
  };

  route('get', '/match-surfaces', 'geography.read', async (req, res) => {
    const { page, pageSize, ...filters } = parse(listMatchSurfacesQuerySchema, req.query);
    res.status(200).json(await mediator.send(new ListMatchSurfacesQuery(filters, page, pageSize)));
  });

  route('get', '/match-surfaces/:surfaceId', 'geography.read', async (req, res) => {
    res.status(200).json(await view(req.params.surfaceId));
  });

  route(
    'post',
    '/match-surfaces',
    { permission: 'catalogs.manage', audit: { action: 'matchSurface.create', resourceType: 'matchSurface', resourceId: () => 'new' } },
    async (req, res) => {
      await sendSaved(res, await mediator.send(SaveMatchSurfaceCommand.create(parse(createMatchSurfaceRequestSchema, req.body))));
    },
  );

  route('patch', '/match-surfaces/:surfaceId', audit('matchSurface.update'), async (req, res) => {
    const { revision, reason, ...changes } = parse(updateMatchSurfaceRequestSchema, req.body);
    await sendSaved(res, await mediator.send(SaveMatchSurfaceCommand.edit(req.params.surfaceId, revision, changes, reason ?? null)));
  });

  route('post', '/match-surfaces/:surfaceId/delete', audit('matchSurface.delete'), async (req, res) => {
    parse(deleteRequestSchema, req.body);
    sendDeleted(res, await mediator.send(new DeleteMatchSurfaceCommand(req.params.surfaceId)), 'surface_not_found');
  });
}
