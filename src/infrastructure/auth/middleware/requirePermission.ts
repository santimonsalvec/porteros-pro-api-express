import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Permission } from '../../../domain/staff/permissionCatalog.js';

export interface RequirePermissionOptions {
  /** Called on every refusal, e.g. to leave a `denied` line in the audit log. */
  onDenied?: (req: Request, permission: Permission) => void;
}

/**
 * Each admin route's permission, checked on the server on every request (spec 001, FR-010): the
 * owner passes always — also for permissions added later — and any other member only with a role
 * that grants it. Goes after `requireAdminAuth`.
 */
export function requirePermission(permission: Permission, options: RequirePermissionOptions = {}): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const access = req.adminAccess;
    if (!access) {
      res.status(401).end();
      return;
    }
    if (access.isOwner || access.permissions.includes(permission)) {
      next();
      return;
    }
    options.onDenied?.(req, permission);
    res.status(403).json({ error: 'permission_denied', message: 'Your role does not allow this action.', permission });
  };
}
