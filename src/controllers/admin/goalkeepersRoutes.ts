import type { Request } from 'express';
import type { ISender } from '../../application/common/mediator/types.js';
import { ListGoalkeepersQuery } from '../../application/features/goalkeepers/queries/listGoalkeepers/listGoalkeepersQuery.js';
import { GetGoalkeeperAdminQuery } from '../../application/features/goalkeepers/queries/getGoalkeeperAdmin/getGoalkeeperAdminQuery.js';
import { GetGoalkeeperDocumentQuery } from '../../application/features/goalkeepers/queries/getGoalkeeperDocument/getGoalkeeperDocumentQuery.js';
import { CorrectGoalkeeperDocumentCommand } from '../../application/features/goalkeepers/commands/correctGoalkeeperDocument/correctGoalkeeperDocumentCommand.js';
import { ApiError } from '../apiError.js';
import { canSeeMarket, countryScopeCriteria } from './scopeCriteria.js';
import { ListGoalkeeperRegistrationsQuery } from '../../application/features/goalkeepers/queries/listGoalkeeperRegistrations/listGoalkeeperRegistrationsQuery.js';
import { GetGoalkeeperRegistrationAdminQuery } from '../../application/features/goalkeepers/queries/getGoalkeeperRegistrationAdmin/getGoalkeeperRegistrationAdminQuery.js';
import { correctDocumentRequestSchema, listGoalkeepersQuerySchema, listRegistrationsQuerySchema } from '../requests/goalkeepers/goalkeepersAdminRequests.js';
import { goalkeeperNotFound } from '../operatingBalance/operatingBalanceHttp.js';
import { conflict, invalidFields, notFound, parse, stale, type Route } from './geographyRoutes.js';

/**
 * Goalkeepers and registrations in progress in the admin web (spec 005 of the admin,
 * contracts/users-goalkeepers-api.md §3–§4). The operating balance, withdrawals and reversal routes stay in
 * `adminController.ts`; the identity document is a sensitive read of its own.
 */
export function registerGoalkeeperAdminRoutes(route: Route, mediator: ISender): void {
  route('get', '/goalkeepers', 'goalkeepers.read', async (req, res) => {
    const { marketId, ...criteria } = parse(listGoalkeepersQuerySchema, req.query);
    const result = await mediator.send(new ListGoalkeepersQuery({ ...criteria, ...countryScopeCriteria(req, marketId) }));
    if (result.outcome === 'search_too_broad') {
      throw new ApiError(400, 'search_too_broad', 'The search finds too many users; narrow it down.');
    }
    res.status(200).json(result.page);
  });

  route('get', '/goalkeepers/:userId', 'goalkeepers.read', async (req, res) => {
    const result = await mediator.send(new GetGoalkeeperAdminQuery(userIdOf(req)));
    if (result.outcome === 'not_a_goalkeeper' || !canSeeMarket(req, result.goalkeeper.market?.id)) throw goalkeeperNotFound();
    res.status(200).json(result.goalkeeper);
  });

  route(
    'get',
    '/goalkeepers/:userId/document',
    { permission: 'goalkeepers.read', read: { action: 'goalkeeper.document.read', resourceType: 'goalkeeper', resourceId: userIdOf } },
    async (req, res) => {
      const result = await mediator.send(new GetGoalkeeperDocumentQuery(userIdOf(req)));
      if (result.outcome === 'not_a_goalkeeper') throw goalkeeperNotFound();
      res.status(200).json(result.document);
    },
  );

  route(
    'patch',
    '/goalkeepers/:userId/document',
    {
      permission: 'goalkeepers.update',
      audit: {
        action: 'goalkeeper.document.update',
        resourceType: 'goalkeeper',
        resourceId: userIdOf,
        // The detail carries the type and the version, never the number (research §8).
        before: async (req) => {
          const read = await mediator.send(new GetGoalkeeperAdminQuery(userIdOf(req)));
          return read.outcome === 'ok' ? read.goalkeeper : null;
        },
      },
    },
    async (req, res) => {
      const body = parse(correctDocumentRequestSchema, req.body);
      const result = await mediator.send(new CorrectGoalkeeperDocumentCommand(userIdOf(req), body.version, body.documentType, body.documentNumber));
      // Exhaustive on purpose: adding an outcome without mapping it here fails compilation.
      switch (result.outcome) {
        case 'corrected': {
          const read = await mediator.send(new GetGoalkeeperAdminQuery(userIdOf(req)));
          res.status(200).json({ ...(read.outcome === 'ok' ? read.goalkeeper : {}), ...result.audit });
          return;
        }
        case 'not_a_goalkeeper':
          throw goalkeeperNotFound();
        case 'invalid_document_type':
          throw conflict('invalid_document_type', 'This document type is not in the catalog.');
        case 'validation_failed':
          throw invalidFields(result.fieldErrors);
        case 'stale':
          throw stale();
        case 'document_already_registered':
          throw conflict('document_already_registered', 'Another account already has this document.');
      }
    },
  );

  route('get', '/goalkeeper-registrations', 'goalkeepers.registrations.review', async (req, res) => {
    const { marketId, ...criteria } = parse(listRegistrationsQuerySchema, req.query);
    res.status(200).json(await mediator.send(new ListGoalkeeperRegistrationsQuery({ ...criteria, ...countryScopeCriteria(req, marketId) })));
  });

  route('get', '/goalkeeper-registrations/:userId', 'goalkeepers.registrations.review', async (req, res) => {
    const result = await mediator.send(new GetGoalkeeperRegistrationAdminQuery(userIdOf(req)));
    if (result.outcome === 'not_found') throw notFound('registration_not_found');
    res.status(200).json(result.registration);
  });
}

const userIdOf = (req: Request) => String(req.params.userId);
