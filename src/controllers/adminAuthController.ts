import { Router, type NextFunction, type Request, type Response } from 'express';
import type { ISender } from '../application/common/mediator/types.js';
import { GetSsoOptionsQuery } from '../application/features/auth/queries/getSsoOptions/getSsoOptionsQuery.js';
import { SignInAdminCommand } from '../application/features/staff/commands/signInAdmin/signInAdminCommand.js';
import { RefreshAdminSessionCommand } from '../application/features/staff/commands/refreshAdminSession/refreshAdminSessionCommand.js';
import { SignOutAdminCommand } from '../application/features/staff/commands/signOutAdmin/signOutAdminCommand.js';
import type { IssuedAdminSession } from '../application/features/staff/common/sessionResponse.js';
import type { AdminWebDependencies } from '../appDependencies.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from '../infrastructure/auth/adminSessionCookie.js';
import { ApiError } from './apiError.js';
import { zodFieldErrors } from './requests/goalkeeperRequests/getServiceQuoteRequest.js';
import { adminSignInRequestSchema } from './requests/staff/adminAuthRequests.js';

export interface AdminAuthControllerDependencies {
  mediator: ISender;
  admin: Pick<AdminWebDependencies, 'sessionCookieSecure'>;
}

/** The value the admin web sends on cookie-authenticated calls; a cross-site form cannot set it. */
const CSRF_HEADER_VALUE = 'porteros-admin';

/**
 * The admin web's sessions (contracts/admin-auth.md): Google sign-in, refresh and sign-out. The
 * refresh value only travels in the `pp_admin_rt` cookie; the body carries the access token.
 */
export function createAdminAuthController(deps: AdminAuthControllerDependencies): Router {
  const router = Router();
  const cookieOptions = { secure: deps.admin.sessionCookieSecure };

  const sendSession = (res: Response, issued: IssuedAdminSession) => {
    setRefreshCookie(res, issued.refreshToken, cookieOptions);
    res.status(200).json({ accessToken: issued.accessToken, expiresInSeconds: issued.expiresInSeconds, session: issued.session });
  };

  const requireCsrfHeader = (req: Request, _res: Response, next: NextFunction) => {
    if (req.header('x-requested-with') !== CSRF_HEADER_VALUE) {
      throw new ApiError(400, 'missing_csrf_header', 'This call needs the X-Requested-With header of the admin web.');
    }
    next();
  };

  // The login screen's Google client. The app's `/auth/sso-options` has no CORS (only the admin's
  // routes do), so the admin web reads its options here, from its own origin.
  router.get('/sso-options', async (_req, res) => {
    const result = await deps.mediator.send(new GetSsoOptionsQuery('admin-web'));
    res.status(200).json({ providers: result.providers });
  });

  router.post('/sign-in', async (req, res) => {
    const parsed = adminSignInRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }
    const result = await deps.mediator.send(new SignInAdminCommand(parsed.data.credential, req.header('user-agent') ?? '', req.ip ?? ''));

    // Exhaustive on purpose: adding an outcome without mapping it here fails compilation.
    switch (result.outcome) {
      case 'signed_in':
        sendSession(res, result);
        return;
      case 'invalid_credential':
        throw new ApiError(401, 'invalid_credential', 'The provided credential could not be verified.');
      case 'unauthorized_admin_account':
        throw new ApiError(403, 'unauthorized_admin_account', 'No administrator account is associated with this identity.');
    }
  });

  router.post('/refresh', requireCsrfHeader, async (req, res) => {
    const refreshToken = readRefreshCookie(req);
    const result = refreshToken ? await deps.mediator.send(new RefreshAdminSessionCommand(refreshToken)) : null;
    if (result?.outcome === 'refreshed') {
      sendSession(res, result);
      return;
    }
    clearRefreshCookie(res, cookieOptions);
    throw new ApiError(401, 'invalid_refresh_token', 'The admin session has ended. Sign in again.');
  });

  router.post('/sign-out', requireCsrfHeader, async (req, res) => {
    await deps.mediator.send(new SignOutAdminCommand(readRefreshCookie(req)));
    clearRefreshCookie(res, cookieOptions);
    res.status(204).end();
  });

  return router;
}
