import type { Request, Response } from 'express';
import type { ISender } from '../../application/common/mediator/types.js';
import { CreateMarketCommand, type CreateMarketResult } from '../../application/features/markets/commands/createMarket/createMarketCommand.js';
import { UpdateMarketCommand, type UpdateMarketResult } from '../../application/features/markets/commands/updateMarket/updateMarketCommand.js';
import { EnableMarketCommand } from '../../application/features/markets/commands/enableMarket/enableMarketCommand.js';
import { DisableMarketCommand } from '../../application/features/markets/commands/disableMarket/disableMarketCommand.js';
import { DeleteMarketCommand } from '../../application/features/markets/commands/deleteMarket/deleteMarketCommand.js';
import { GetMarketReadinessQuery } from '../../application/features/markets/queries/getMarketReadiness/getMarketReadinessQuery.js';
import { GetMarketQuery } from '../../application/features/markets/queries/getMarket/getMarketQuery.js';
import { ListMarketsQuery } from '../../application/features/markets/queries/listMarkets/listMarketsQuery.js';
import { ApiError } from '../apiError.js';
import { holdsCountry } from '../../domain/staff/staffScope.js';
import { canSeeMarket } from './scopeCriteria.js';
import {
  createMarketRequestSchema,
  disableMarketRequestSchema,
  listMarketsQuerySchema,
  marketRevisionRequestSchema,
  updateMarketRequestSchema,
} from '../requests/markets/marketRequests.js';
import { conflict, invalidFields, notFound, parse, stale, type Route } from './geographyRoutes.js';

const param = (req: Request, name: string) => String(req.params[name]);

/** Creating and changing a market's state needs its whole country, or the platform (spec 031, FR-041a). */
function assertHoldsCountry(req: Request, countryId: string): void {
  const access = req.adminAccess!;
  if (!holdsCountry(access.scopes, access.isOwner, countryId)) {
    throw new ApiError(403, 'scope_denied', 'Creating or changing the state of a market needs its whole country.');
  }
}

/** The markets (spec 031, contracts/markets-api.md §C). */
export function registerMarketsRoutes(route: Route, mediator: ISender): void {
  const marketView = async (marketId: string) => {
    const result = await mediator.send(new GetMarketQuery(marketId));
    if (result.outcome === 'not_found') throw notFound('market_not_found');
    return result.market;
  };
  const marketBefore = async (req: Request) => {
    const result = await mediator.send(new GetMarketQuery(param(req, 'marketId')));
    return result.outcome === 'ok' ? result.market : null;
  };
  // Enabling, disabling and deleting work at the country level (spec 031, FR-041a).
  const marketAudit = (action: string, permission: 'markets.manage' | 'markets.lifecycle' = 'markets.manage') => ({
    permission,
    ...(permission === 'markets.lifecycle' ? { level: 'country' as const } : {}),
    audit: { action, resourceType: 'market', resourceId: (req: Request) => param(req, 'marketId'), before: marketBefore },
  });

  const refusal = (result: Exclude<CreateMarketResult | UpdateMarketResult, { outcome: 'created' | 'saved' }>): ApiError => {
    switch (result.outcome) {
      case 'invalid':
        return invalidFields(result.fieldErrors);
      case 'country_not_found':
        return notFound('country_not_found');
      case 'country_without_currency':
        return conflict('country_without_currency');
      case 'market_name_taken':
        return conflict('market_name_taken');
      case 'country_immutable':
        return conflict('country_immutable');
      case 'not_found':
        return notFound('market_not_found');
      case 'stale':
        return stale();
    }
  };

  route('get', '/markets', 'markets.read', async (req, res) => {
    const list = await mediator.send(new ListMarketsQuery(parse(listMarketsQuerySchema, req.query)));
    // Spec 031: only the markets the member holds.
    res.status(200).json({ ...list, items: list.items.filter((market) => canSeeMarket(req, market.id)) });
  });

  route('get', '/markets/:marketId', 'markets.read', async (req, res) => {
    if (!canSeeMarket(req, req.params.marketId)) throw notFound('market_not_found');
    res.status(200).json(await marketView(req.params.marketId));
  });

  route(
    'post',
    '/markets',
    { permission: 'markets.manage', level: 'country', audit: { action: 'market.create', resourceType: 'market', resourceId: () => 'new' } },
    async (req, res: Response) => {
      const fields = parse(createMarketRequestSchema, req.body);
      assertHoldsCountry(req, fields.countryId);
      const result = await mediator.send(new CreateMarketCommand(fields, req.adminAccess!.staffId));
      if (result.outcome !== 'created') throw refusal(result);
      res.locals.auditResourceId = result.marketId;
      res.status(201).json({ marketId: result.marketId, market: await marketView(result.marketId) });
    },
  );

  route('patch', '/markets/:marketId', marketAudit('market.update'), async (req, res) => {
    const { revision, ...edits } = parse(updateMarketRequestSchema, req.body);
    const result = await mediator.send(new UpdateMarketCommand(req.params.marketId, revision, edits));
    if (result.outcome !== 'saved') throw refusal(result);
    res.status(200).json(await marketView(req.params.marketId));
  });

  route('get', '/markets/:marketId/readiness', 'markets.read', async (req, res) => {
    if (!canSeeMarket(req, req.params.marketId)) throw notFound('market_not_found');
    const result = await mediator.send(new GetMarketReadinessQuery(req.params.marketId));
    if (result.outcome === 'not_found') throw notFound('market_not_found');
    res.status(200).json(result.readiness);
  });

  route('post', '/markets/:marketId/enable', marketAudit('market.enable', 'markets.lifecycle'), async (req, res) => {
    assertHoldsCountry(req, (await marketView(req.params.marketId)).country?.id ?? '');
    const { revision } = parse(marketRevisionRequestSchema, req.body);
    const result = await mediator.send(new EnableMarketCommand(req.params.marketId, revision, req.adminAccess!.staffId));
    switch (result.outcome) {
      case 'enabled':
        res.status(200).json(await marketView(req.params.marketId));
        return;
      case 'not_found':
        throw notFound('market_not_found');
      case 'stale':
        throw stale();
      case 'already_enabled':
        throw conflict('already_enabled');
      case 'not_ready':
        throw new ApiError(409, 'not_ready', 'The market checklist is not complete.', undefined, { items: result.items });
    }
  });

  route('post', '/markets/:marketId/disable', marketAudit('market.disable', 'markets.lifecycle'), async (req, res) => {
    assertHoldsCountry(req, (await marketView(req.params.marketId)).country?.id ?? '');
    const { revision, reason } = parse(disableMarketRequestSchema, req.body);
    const result = await mediator.send(new DisableMarketCommand(req.params.marketId, revision, reason ?? null, req.adminAccess!.staffId));
    switch (result.outcome) {
      case 'disabled':
        res.status(200).json(await marketView(req.params.marketId));
        return;
      case 'not_found':
        throw notFound('market_not_found');
      case 'stale':
        throw stale();
      case 'not_enabled':
        throw conflict('not_enabled');
      case 'reason_required':
        throw invalidFields({ reason: 'A reason of 3–300 characters is required.' });
    }
  });

  route('post', '/markets/:marketId/delete', marketAudit('market.delete', 'markets.lifecycle'), async (req, res) => {
    assertHoldsCountry(req, (await marketView(req.params.marketId)).country?.id ?? '');
    const { revision } = parse(marketRevisionRequestSchema, req.body);
    const result = await mediator.send(new DeleteMarketCommand(req.params.marketId, revision));
    switch (result.outcome) {
      case 'deleted':
        // `res.json` is what writes the audit entry: the 204 goes out with an empty body.
        res.status(204).json(null);
        return;
      case 'not_found':
        throw notFound('market_not_found');
      case 'stale':
        throw stale();
      case 'in_use':
        throw new ApiError(409, 'in_use', 'Something still points at the market.', undefined, { kind: result.kind, count: result.count });
    }
  });
}
