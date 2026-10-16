import type { HandlerRegistration } from '../application/common/mediator/mediator.js';
import type { UsersQueryDependencies } from '../application/features/users/common/usersQueryDependencies.js';
import { ListUsersQuery } from '../application/features/users/queries/listUsers/listUsersQuery.js';
import { ListUsersQueryHandler } from '../application/features/users/queries/listUsers/listUsersQueryHandler.js';
import { GetUserQuery } from '../application/features/users/queries/getUser/getUserQuery.js';
import { GetUserQueryHandler } from '../application/features/users/queries/getUser/getUserQueryHandler.js';
import { GetUserPhoneQuery } from '../application/features/users/queries/getUserPhone/getUserPhoneQuery.js';
import { GetUserPhoneQueryHandler } from '../application/features/users/queries/getUserPhone/getUserPhoneQueryHandler.js';

import { GetUserAuditQuery } from '../application/features/users/queries/getUserAudit/getUserAuditQuery.js';
import { GetUserAuditQueryHandler } from '../application/features/users/queries/getUserAudit/getUserAuditQueryHandler.js';
import { UpdateUserContactCommand } from '../application/features/users/commands/updateUserContact/updateUserContactCommand.js';
import { UpdateUserContactCommandHandler } from '../application/features/users/commands/updateUserContact/updateUserContactCommandHandler.js';
import type { IUserContactWriter } from '../application/features/users/common/ports.js';
import type { IClock } from '../application/common/clock.js';
import type { IGoalkeeperAdminReader } from '../application/features/goalkeepers/common/adminPorts.js';
import type { IGoalkeeperProfileRepository } from '../application/features/goalkeepers/common/ports.js';
import type { IMarketRepository } from '../application/features/markets/common/ports.js';
import type { IZoneRepository } from '../application/features/zones/common/ports.js';
import { BlockUserCommand } from '../application/features/users/commands/blockUser/blockUserCommand.js';
import { BlockUserCommandHandler } from '../application/features/users/commands/blockUser/blockUserCommandHandler.js';
import { UnblockUserCommand } from '../application/features/users/commands/unblockUser/unblockUserCommand.js';
import { UnblockUserCommandHandler } from '../application/features/users/commands/unblockUser/unblockUserCommandHandler.js';
import { GetBlockImpactQuery } from '../application/features/users/queries/getBlockImpact/getBlockImpactQuery.js';
import { GetBlockImpactQueryHandler } from '../application/features/users/queries/getBlockImpact/getBlockImpactQueryHandler.js';

/** What the admin's user handlers read and write (porteros-pro-admin spec 005). */
export interface UsersHandlerDependencies extends UsersQueryDependencies {
  contacts: IUserContactWriter;
  profiles: Pick<IGoalkeeperProfileRepository, 'getByUserId' | 'setAvailableForOffers'>;
  goalkeeperReader: Pick<IGoalkeeperAdminReader, 'upcomingBookings'>;
  zones: Pick<IZoneRepository, 'getManyByIds'>;
  markets: Pick<IMarketRepository, 'getByIds'>;
  clock: IClock;
}

/**
 * The admin web's user handlers, shared by the composition root and the HTTP tests' fake-backed
 * one so both register exactly the same set.
 */
export function usersHandlerRegistrations(deps: UsersHandlerDependencies): HandlerRegistration[] {
  return [
    { requestType: ListUsersQuery, handler: new ListUsersQueryHandler(deps) },
    { requestType: GetUserQuery, handler: new GetUserQueryHandler(deps) },
    { requestType: GetUserPhoneQuery, handler: new GetUserPhoneQueryHandler(deps) },
    { requestType: GetUserAuditQuery, handler: new GetUserAuditQueryHandler(deps) },
    { requestType: UpdateUserContactCommand, handler: new UpdateUserContactCommandHandler(deps) },
    { requestType: BlockUserCommand, handler: new BlockUserCommandHandler(deps) },
    { requestType: UnblockUserCommand, handler: new UnblockUserCommandHandler(deps) },
    { requestType: GetBlockImpactQuery, handler: new GetBlockImpactQueryHandler({ ...deps, userReader: deps.reader }) },
  ];
}
