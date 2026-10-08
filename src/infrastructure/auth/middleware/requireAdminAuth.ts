import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AdminAccessTokenClaims, IStaffAccessResolver } from '../../../application/features/staff/common/ports.js';
import type { Permission } from '../../../domain/staff/permissionCatalog.js';

/** Who is calling an admin route, resolved on this request. */
export interface AdminAccess {
  userId: string;
  staffId: string;
  sessionId: string;
  email: string;
  roleId: string;
  permissions: Permission[];
  isOwner: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminAccess?: AdminAccess;
    }
  }
}

/**
 * The admin web's authentication: a bearer token of the admin audience whose session still
 * resolves to an active member. Anything else — no token, an app token, a revoked or expired
 * session, a disabled member — is a 401 with no body, like `requireAuth`.
 */
export function requireAdminAuth(
  verifyAdminAccessToken: (token: string) => Promise<AdminAccessTokenClaims | null>,
  resolver: IStaffAccessResolver,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    const claims = token ? await verifyAdminAccessToken(token) : null;
    const access = claims ? await resolver.resolve(claims.sessionId) : null;
    if (!claims || !access || access.member.id !== claims.staffId) {
      res.status(401).end();
      return;
    }

    req.adminAccess = {
      userId: claims.userId,
      staffId: claims.staffId,
      sessionId: claims.sessionId,
      email: access.member.email,
      roleId: access.role.id,
      permissions: access.permissions,
      isOwner: access.isOwner,
    };
    next();
  };
}
