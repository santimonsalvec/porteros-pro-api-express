import type { RequestHandler, Router } from 'express';
import type { RouteParameters } from 'express-serve-static-core';
import type { AdminWebDependencies } from '../../appDependencies.js';
import type { Permission } from '../../domain/staff/permissionCatalog.js';
import { auditTrail, type AuditSpec } from '../../infrastructure/audit/audited.js';
import { requirePermission } from '../../infrastructure/auth/middleware/requirePermission.js';
import { logger } from '../../infrastructure/observability/logger.js';
import { maskEmails } from '../../infrastructure/observability/maskEmails.js';

export type AdminRouteGuard = Permission | { permission: Permission; audit: Omit<AuditSpec, 'permission'> };

/**
 * How every `/admin/*` route is declared (spec 001, reused by spec 002's team routes): the
 * permission it needs and, for a write, how it is audited. The path's own params type the
 * handlers, as `router.get(path, handler)` would.
 */
export function createAdminRouting(router: Router, admin: Pick<AdminWebDependencies, 'auditLog' | 'newId' | 'now'>) {
  const trail = auditTrail({
    auditLog: admin.auditLog,
    newId: admin.newId,
    now: admin.now,
    // The write already happened: an entry the log could not take goes to the error log, redacted.
    logError: (entry) => {
      // The actor by ids, and any other email (an invitation's id, a member's before/after) masked.
      const actor = 'staffId' in entry.actor ? { staffId: entry.actor.staffId, userId: entry.actor.userId } : entry.actor;
      logger.error({ audit: 'admin_audit_unwritten', entry: maskEmails({ ...entry, actor }) }, 'Admin audit entry could not be stored');
    },
  });

  const route = <Path extends string>(
    method: 'get' | 'post' | 'put' | 'patch',
    path: Path,
    guard: AdminRouteGuard,
    ...handlers: RequestHandler<RouteParameters<Path>>[]
  ) => {
    const permission = typeof guard === 'string' ? guard : guard.permission;
    const audit = typeof guard === 'string' ? [] : [trail.audited({ ...guard.audit, permission })];
    router[method](path, requirePermission(permission, { onDenied: trail.onDenied }), ...audit, ...(handlers as RequestHandler[]));
  };

  return { route, trail };
}

/** The state before a write, through an existing read; null when there is none yet. */
export async function settingsBefore(result: Promise<{ outcome: string; settings?: unknown }>): Promise<unknown> {
  const read = await result;
  return read.outcome === 'success' ? read.settings : null;
}
