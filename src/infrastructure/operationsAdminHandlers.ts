import type { HandlerRegistration } from '../application/common/mediator/mediator.js';
import type { IRatingAdminReader } from '../application/features/ratings/common/adminPorts.js';
import { ListRatingsAdminQuery } from '../application/features/ratings/queries/listRatingsAdmin/listRatingsAdminQuery.js';
import { ListRatingsAdminQueryHandler } from '../application/features/ratings/queries/listRatingsAdmin/listRatingsAdminQueryHandler.js';
import type { IUserRepository } from '../application/features/auth/common/ports.js';
import type { INotificationAdminReader } from '../application/features/notifications/common/adminPorts.js';
import { ListUserNotificationsAdminQuery } from '../application/features/notifications/queries/listUserNotificationsAdmin/listUserNotificationsAdminQuery.js';
import { ListUserNotificationsAdminQueryHandler } from '../application/features/notifications/queries/listUserNotificationsAdmin/listUserNotificationsAdminQueryHandler.js';
import type { RequestsAdminDependencies } from '../application/features/goalkeeperRequests/common/requestsAdminDependencies.js';
import { GetCheckInPhotoQuery } from '../application/features/goalkeeperRequests/queries/getCheckInPhoto/getCheckInPhotoQuery.js';
import { GetCheckInPhotoQueryHandler } from '../application/features/goalkeeperRequests/queries/getCheckInPhoto/getCheckInPhotoQueryHandler.js';
import type { CasesAdminDependencies } from '../application/features/cases/common/casesAdminDependencies.js';
import { GetCaseAdminQuery } from '../application/features/cases/queries/getCaseAdmin/getCaseAdminQuery.js';
import { GetCaseAdminQueryHandler } from '../application/features/cases/queries/getCaseAdmin/getCaseAdminQueryHandler.js';
import { ListCasesAdminQuery } from '../application/features/cases/queries/listCasesAdmin/listCasesAdminQuery.js';
import { ListCasesAdminQueryHandler } from '../application/features/cases/queries/listCasesAdmin/listCasesAdminQueryHandler.js';
import { GetRequestAdminQuery, type GetRequestAdminResult } from '../application/features/goalkeeperRequests/queries/getRequestAdmin/getRequestAdminQuery.js';
import { GetRequestAdminQueryHandler } from '../application/features/goalkeeperRequests/queries/getRequestAdmin/getRequestAdminQueryHandler.js';
import { ListRequestsAdminQuery } from '../application/features/goalkeeperRequests/queries/listRequestsAdmin/listRequestsAdminQuery.js';
import { ListRequestsAdminQueryHandler } from '../application/features/goalkeeperRequests/queries/listRequestsAdmin/listRequestsAdminQueryHandler.js';

/** What the admin's operations handlers read and write (porteros-pro-admin spec 006). */
export interface OperationsHandlerDependencies extends RequestsAdminDependencies, Omit<CasesAdminDependencies, 'requestReader' | 'requestDetail'> {
  /** Usually the mediator: a case shows its request's facts through the request query. */
  send: (query: GetRequestAdminQuery) => Promise<GetRequestAdminResult>;
  users: Pick<IUserRepository, 'getById' | 'getByIds'>;
  notificationReader: INotificationAdminReader;
  ratingReader: IRatingAdminReader;
}

/**
 * The admin web's operations handlers, shared by the composition root and the HTTP tests'
 * fake-backed one so both register exactly the same set.
 */
export function operationsHandlerRegistrations(deps: OperationsHandlerDependencies): HandlerRegistration[] {
  const cases: CasesAdminDependencies = { ...deps, requestReader: deps.reader, requestDetail: (requestId) => deps.send(new GetRequestAdminQuery(requestId)) };
  return [
    { requestType: ListRequestsAdminQuery, handler: new ListRequestsAdminQueryHandler(deps) },
    { requestType: GetRequestAdminQuery, handler: new GetRequestAdminQueryHandler(deps) },
    { requestType: GetCheckInPhotoQuery, handler: new GetCheckInPhotoQueryHandler(deps) },
    { requestType: ListCasesAdminQuery, handler: new ListCasesAdminQueryHandler(cases) },
    { requestType: GetCaseAdminQuery, handler: new GetCaseAdminQueryHandler(cases) },
    { requestType: ListRatingsAdminQuery, handler: new ListRatingsAdminQueryHandler({ ...deps, reader: deps.ratingReader }) },
    { requestType: ListUserNotificationsAdminQuery, handler: new ListUserNotificationsAdminQueryHandler({ reader: deps.notificationReader, users: deps.users }) },
  ];
}
