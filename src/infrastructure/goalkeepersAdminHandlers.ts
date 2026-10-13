import type { HandlerRegistration } from '../application/common/mediator/mediator.js';
import type { GoalkeepersAdminDependencies } from '../application/features/goalkeepers/common/goalkeepersAdminDependencies.js';
import { ListGoalkeepersQuery } from '../application/features/goalkeepers/queries/listGoalkeepers/listGoalkeepersQuery.js';
import { ListGoalkeepersQueryHandler } from '../application/features/goalkeepers/queries/listGoalkeepers/listGoalkeepersQueryHandler.js';
import { GetGoalkeeperAdminQuery } from '../application/features/goalkeepers/queries/getGoalkeeperAdmin/getGoalkeeperAdminQuery.js';
import { GetGoalkeeperAdminQueryHandler } from '../application/features/goalkeepers/queries/getGoalkeeperAdmin/getGoalkeeperAdminQueryHandler.js';
import { GetGoalkeeperDocumentQuery } from '../application/features/goalkeepers/queries/getGoalkeeperDocument/getGoalkeeperDocumentQuery.js';
import { GetGoalkeeperDocumentQueryHandler } from '../application/features/goalkeepers/queries/getGoalkeeperDocument/getGoalkeeperDocumentQueryHandler.js';
import { CorrectGoalkeeperDocumentCommand } from '../application/features/goalkeepers/commands/correctGoalkeeperDocument/correctGoalkeeperDocumentCommand.js';
import { CorrectGoalkeeperDocumentCommandHandler } from '../application/features/goalkeepers/commands/correctGoalkeeperDocument/correctGoalkeeperDocumentCommandHandler.js';
import type { IGoalkeeperDocumentWriter } from '../application/features/goalkeepers/common/adminPorts.js';
import type { IGoalkeeperRegistrationRepository } from '../application/features/goalkeepers/common/ports.js';
import type { IImageRepository } from '../application/features/images/common/ports.js';
import type { IRegistrationAdminReader } from '../application/features/goalkeepers/common/adminPorts.js';
import { ListGoalkeeperRegistrationsQuery } from '../application/features/goalkeepers/queries/listGoalkeeperRegistrations/listGoalkeeperRegistrationsQuery.js';
import { ListGoalkeeperRegistrationsQueryHandler } from '../application/features/goalkeepers/queries/listGoalkeeperRegistrations/listGoalkeeperRegistrationsQueryHandler.js';
import { GetGoalkeeperRegistrationAdminQuery } from '../application/features/goalkeepers/queries/getGoalkeeperRegistrationAdmin/getGoalkeeperRegistrationAdminQuery.js';
import { GetGoalkeeperRegistrationAdminQueryHandler } from '../application/features/goalkeepers/queries/getGoalkeeperRegistrationAdmin/getGoalkeeperRegistrationAdminQueryHandler.js';

/** What the admin's goalkeeper handlers read and write (porteros-pro-admin spec 005). */
export interface GoalkeepersAdminHandlerDependencies extends GoalkeepersAdminDependencies {
  registrations: IGoalkeeperRegistrationRepository & IRegistrationAdminReader;
  images: Pick<IImageRepository, 'getById'>;
  documentWriter: IGoalkeeperDocumentWriter;
}

/**
 * The admin web's goalkeeper and registration handlers, shared by the composition root and the
 * HTTP tests' fake-backed one so both register exactly the same set.
 */
export function goalkeepersAdminHandlerRegistrations(deps: GoalkeepersAdminHandlerDependencies): HandlerRegistration[] {
  return [
    { requestType: ListGoalkeepersQuery, handler: new ListGoalkeepersQueryHandler(deps) },
    { requestType: GetGoalkeeperAdminQuery, handler: new GetGoalkeeperAdminQueryHandler(deps) },
    { requestType: GetGoalkeeperDocumentQuery, handler: new GetGoalkeeperDocumentQueryHandler(deps) },
    { requestType: ListGoalkeeperRegistrationsQuery, handler: new ListGoalkeeperRegistrationsQueryHandler(deps) },
    { requestType: GetGoalkeeperRegistrationAdminQuery, handler: new GetGoalkeeperRegistrationAdminQueryHandler(deps) },
    { requestType: CorrectGoalkeeperDocumentCommand, handler: new CorrectGoalkeeperDocumentCommandHandler({ ...deps, writer: deps.documentWriter }) },
  ];
}
