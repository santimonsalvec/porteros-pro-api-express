import type { HandlerRegistration } from '../application/common/mediator/mediator.js';
import type { AppSessionDependencies } from '../application/features/auth/common/issueAppSession.js';
import type { IAccessSettingsRepository, ILoginCodeAuditLogger, IUserRepository } from '../application/features/auth/common/ports.js';
import { GetAccessSettingsQuery } from '../application/features/auth/queries/getAccessSettings/getAccessSettingsQuery.js';
import { GetAccessSettingsQueryHandler } from '../application/features/auth/queries/getAccessSettings/getAccessSettingsQueryHandler.js';
import { SetAccessSettingsCommand } from '../application/features/auth/commands/setAccessSettings/setAccessSettingsCommand.js';
import { SetAccessSettingsCommandHandler } from '../application/features/auth/commands/setAccessSettings/setAccessSettingsCommandHandler.js';
import type { LoginCodeDependencies } from '../application/features/auth/common/requestLoginCode.js';
import { RequestEmailCodeCommand } from '../application/features/auth/commands/requestEmailCode/requestEmailCodeCommand.js';
import { RequestEmailCodeCommandHandler } from '../application/features/auth/commands/requestEmailCode/requestEmailCodeCommandHandler.js';
import { VerifyEmailCodeCommand } from '../application/features/auth/commands/verifyEmailCode/verifyEmailCodeCommand.js';
import { VerifyEmailCodeCommandHandler } from '../application/features/auth/commands/verifyEmailCode/verifyEmailCodeCommandHandler.js';
import type { AdminLoginCodeDependencies } from '../application/features/staff/common/adminLoginCodeDependencies.js';
import { RequestAdminEmailCodeCommand } from '../application/features/staff/commands/requestAdminEmailCode/requestAdminEmailCodeCommand.js';
import { RequestAdminEmailCodeCommandHandler } from '../application/features/staff/commands/requestAdminEmailCode/requestAdminEmailCodeCommandHandler.js';
import { VerifyAdminEmailCodeCommand } from '../application/features/staff/commands/verifyAdminEmailCode/verifyAdminEmailCodeCommand.js';
import { VerifyAdminEmailCodeCommandHandler } from '../application/features/staff/commands/verifyAdminEmailCode/verifyAdminEmailCodeCommandHandler.js';

export interface LoginCodeHandlerDependencies {
  /** The code's store, mailer, hash, limits and expiry; the log is per product. */
  loginCodes: Omit<LoginCodeDependencies, 'log'>;
  appLog: ILoginCodeAuditLogger;
  users: IUserRepository;
  appSession: AppSessionDependencies;
  /** The admin web's staff parts; `loginCodes` and `users` come from above. */
  admin: Omit<AdminLoginCodeDependencies, 'loginCodes' | 'users'>;
  /** Configuración → Acceso (US4): the same store `loginCodes.settings` reads. */
  accessSettings: IAccessSettingsRepository;
}

/**
 * The sign-in code's handlers (porteros-pro-admin spec 009), shared by the composition root and the
 * HTTP tests' fake-backed one so both register exactly the same set.
 */
export function loginCodeHandlerRegistrations(deps: LoginCodeHandlerDependencies): HandlerRegistration[] {
  const app: LoginCodeDependencies = { ...deps.loginCodes, log: (entry) => deps.appLog.logEmailCodeEvent(entry) };
  const admin: AdminLoginCodeDependencies = { ...deps.admin, loginCodes: deps.loginCodes, users: deps.users };
  return [
    { requestType: GetAccessSettingsQuery, handler: new GetAccessSettingsQueryHandler(deps.accessSettings) },
    { requestType: SetAccessSettingsCommand, handler: new SetAccessSettingsCommandHandler(deps.accessSettings, deps.loginCodes.clock) },
    { requestType: RequestAdminEmailCodeCommand, handler: new RequestAdminEmailCodeCommandHandler(admin) },
    { requestType: VerifyAdminEmailCodeCommand, handler: new VerifyAdminEmailCodeCommandHandler(admin) },
    { requestType: RequestEmailCodeCommand, handler: new RequestEmailCodeCommandHandler(app) },
    {
      requestType: VerifyEmailCodeCommand,
      handler: new VerifyEmailCodeCommandHandler({ ...app, users: deps.users, userIds: deps.loginCodes.ids, session: deps.appSession }),
    },
  ];
}
