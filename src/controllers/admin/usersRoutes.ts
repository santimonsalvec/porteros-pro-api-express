import type { Request } from 'express';
import type { ISender } from '../../application/common/mediator/types.js';
import { ListUsersQuery } from '../../application/features/users/queries/listUsers/listUsersQuery.js';
import { GetUserQuery } from '../../application/features/users/queries/getUser/getUserQuery.js';
import { GetUserPhoneQuery } from '../../application/features/users/queries/getUserPhone/getUserPhoneQuery.js';
import { GetUserAuditQuery } from '../../application/features/users/queries/getUserAudit/getUserAuditQuery.js';
import { UpdateUserContactCommand } from '../../application/features/users/commands/updateUserContact/updateUserContactCommand.js';
import { BlockUserCommand } from '../../application/features/users/commands/blockUser/blockUserCommand.js';
import { UnblockUserCommand } from '../../application/features/users/commands/unblockUser/unblockUserCommand.js';
import { GetBlockImpactQuery } from '../../application/features/users/queries/getBlockImpact/getBlockImpactQuery.js';
import { blockReasonRequestSchema, listUsersQuerySchema, updateUserContactRequestSchema } from '../requests/users/usersRequests.js';
import { conflict, invalidFields, notFound, parse, stale, type Route } from './geographyRoutes.js';

/**
 * Users in the admin web (spec 005 of the admin, contracts/users-goalkeepers-api.md §1–§2): read
 * with `users.read`, corrected with `users.update`, blocked with `users.block`. The phone number
 * is a sensitive read of its own.
 */
export function registerUsersRoutes(route: Route, mediator: ISender): void {
  route('get', '/users', 'users.read', async (req, res) => {
    const query = parse(listUsersQuerySchema, req.query);
    res.status(200).json(await mediator.send(new ListUsersQuery(query)));
  });

  route('get', '/users/:userId', 'users.read', async (req, res) => {
    const result = await mediator.send(new GetUserQuery(userIdOf(req)));
    if (result.outcome === 'not_found') throw notFound('user_not_found');
    res.status(200).json(result.user);
  });

  route(
    'get',
    '/users/:userId/phone',
    { permission: 'users.read', read: { action: 'user.phone.read', resourceType: 'user', resourceId: userIdOf } },
    async (req, res) => {
      const result = await mediator.send(new GetUserPhoneQuery(userIdOf(req)));
      // Exhaustive on purpose: adding an outcome without mapping it here fails compilation.
      switch (result.outcome) {
        case 'ok':
          res.status(200).json(result.phone);
          return;
        case 'not_found':
          throw notFound('user_not_found');
        case 'phone_not_set':
          throw notFound('phone_not_set');
      }
    },
  );

  route(
    'patch',
    '/users/:userId',
    {
      permission: 'users.update',
      audit: { action: 'user.update', resourceType: 'user', resourceId: userIdOf, before: (req) => mediator.send(new GetUserAuditQuery(userIdOf(req))) },
    },
    async (req, res) => {
      const { version, ...correction } = parse(updateUserContactRequestSchema, req.body);
      const result = await mediator.send(new UpdateUserContactCommand(userIdOf(req), version, correction));
      // Exhaustive on purpose: adding an outcome without mapping it here fails compilation.
      switch (result.outcome) {
        case 'corrected':
          res.status(200).json(result.audit);
          return;
        case 'not_found':
          throw notFound('user_not_found');
        case 'profile_incomplete':
          throw conflict('profile_incomplete', 'The user has not completed the profile yet.');
        case 'validation_failed':
          throw invalidFields(result.fieldErrors);
        case 'invalid_country_code':
          throw conflict('invalid_country_code', 'No country has this code.');
        case 'duplicate_phone_number':
          // Never says whose number it is.
          throw conflict('duplicate_phone_number', 'Another account already has this number.');
        case 'stale':
          throw stale();
      }
    },
  );

  route('get', '/users/:userId/block-impact', 'users.block', async (req, res) => {
    const result = await mediator.send(new GetBlockImpactQuery(userIdOf(req)));
    if (result.outcome === 'not_found') throw notFound('user_not_found');
    res.status(200).json(result.impact);
  });

  for (const action of ['block', 'unblock'] as const) {
    route(
      'post',
      `/users/:userId/${action}`,
      { permission: 'users.block', audit: { action: `user.${action}`, resourceType: 'userBlock', resourceId: userIdOf } },
      async (req, res) => {
        const { reason } = parse(blockReasonRequestSchema, req.body);
        const actor = req.adminAccess!.userId;
        const result =
          action === 'block'
            ? await mediator.send(new BlockUserCommand(actor, userIdOf(req), reason))
            : await mediator.send(new UnblockUserCommand(actor, userIdOf(req), reason));
        switch (result.outcome) {
          case 'not_found':
            throw notFound('user_not_found');
          case 'validation_failed':
            throw invalidFields(result.fieldErrors);
          case 'replayed':
            res.locals.auditOutcome = 'replayed';
            res.status(200).json(result.result);
            return;
          default:
            res.status(200).json(result.result);
        }
      },
    );
  }
}

const userIdOf = (req: Request) => String(req.params.userId);
