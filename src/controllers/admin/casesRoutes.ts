import type { Request } from 'express';
import type { ISender } from '../../application/common/mediator/types.js';
import { ResolveCaseCommand } from '../../application/features/cases/commands/resolveCase/resolveCaseCommand.js';
import { GetCaseQuery } from '../../application/features/cases/queries/getCase/getCaseQuery.js';
import { GetCaseAdminQuery } from '../../application/features/cases/queries/getCaseAdmin/getCaseAdminQuery.js';
import { ListCasesAdminQuery } from '../../application/features/cases/queries/listCasesAdmin/listCasesAdminQuery.js';
import { GetCheckInPhotoQuery } from '../../application/features/goalkeeperRequests/queries/getCheckInPhoto/getCheckInPhotoQuery.js';
import { ApiError } from '../apiError.js';
import { listCasesQuerySchema, resolveCaseRequestSchema } from '../requests/cases/caseRequests.js';
import { invalid, notFound, parse, type Route } from './geographyRoutes.js';
import { canSeeMarket, marketScopeCriteria } from './scopeCriteria.js';

const caseIdOf = (req: Request) => String(req.params.caseId);

/**
 * Cases for manual review (feature 021), moved here from `adminController.ts` by admin spec 006:
 * the list gains filters, the detail its booking and names, and the check-in photo becomes a
 * sensitive read of its own (contracts/operations-api.md §6–§9).
 */
export function registerCasesRoutes(route: Route, mediator: ISender): void {
  route('get', '/cases', 'cases.read', async (req, res) => {
    const { status, ...criteria } = parse(listCasesQuerySchema, req.query);
    const result = await mediator.send(new ListCasesAdminQuery({ ...criteria, status, ...marketScopeCriteria(req) }));
    res.status(200).json(result.page);
  });

  route('get', '/cases/:caseId', 'cases.read', async (req, res) => {
    const result = await mediator.send(new GetCaseAdminQuery(caseIdOf(req)));
    if (result.outcome === 'case_not_found' || !canSeeMarket(req, result.case.match?.market.id)) throw notFound('case_not_found');
    res.status(200).json(result.case);
  });

  route(
    'get',
    '/cases/:caseId/check-in-photo',
    { permission: 'cases.read', read: { action: 'booking.check_in_photo.read', resourceType: 'case', resourceId: caseIdOf } },
    async (req, res) => {
      const found = await mediator.send(new GetCaseQuery(caseIdOf(req)));
      if (found.outcome === 'case_not_found') throw notFound('case_not_found');
      const result = await mediator.send(new GetCheckInPhotoQuery(found.case.bookingId));
      if (result.outcome !== 'ok') throw notFound('check_in_not_found');
      res.status(200).json(result.photo);
    },
  );

  route('post', '/cases/:caseId/resolve', {
    permission: 'cases.resolve',
    audit: {
      action: 'case.resolve',
      resourceType: 'case',
      resourceId: caseIdOf,
      before: async (req) => {
        const result = await mediator.send(new GetCaseQuery(caseIdOf(req)));
        return result.outcome === 'ok' ? result.case : null;
      },
    },
  }, async (req, res) => {
    const parsed = resolveCaseRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw invalid(parsed.error);
    const result = await mediator.send(new ResolveCaseCommand(req.adminAccess!.userId, caseIdOf(req), parsed.data.note));

    // Exhaustive on purpose: adding an outcome without mapping it here fails compilation.
    switch (result.outcome) {
      case 'resolved':
        res.status(200).json(result.case);
        return;
      case 'case_not_found':
        throw notFound('case_not_found');
      case 'case_already_resolved':
        throw new ApiError(409, 'case_already_resolved', 'This case is already resolved.');
      case 'invalid_note':
        throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', { note: result.message });
    }
  });
}
