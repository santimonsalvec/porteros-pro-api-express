import type { RequestHandler, Router } from 'express';
import type { RouteParameters } from 'express-serve-static-core';
import type { AdminWebDependencies } from '../../appDependencies.js';
import type { Permission } from '../../domain/staff/permissionCatalog.js';
import { auditTrail, type AuditSpec } from '../../infrastructure/audit/audited.js';
import { requirePermission } from '../../infrastructure/auth/middleware/requirePermission.js';
import { requireScope, type ScopeLevel } from '../../infrastructure/auth/middleware/requireScope.js';
import { logger } from '../../infrastructure/observability/logger.js';
import { maskEmails } from '../../infrastructure/observability/maskEmails.js';

/**
 * A route's permission and, optionally, its audit: `audit` for a write (before and after), `read`
 * for a read that shows sensitive personal data (FR-023a of spec 001: who looked, never the data).
 */
export type AdminRouteGuard =
  | Permission
  | { permission: Permission; level?: ScopeLevel }
  | { permission: Permission; audit: Omit<AuditSpec, 'permission'>; level?: ScopeLevel }
  | { permission: Permission; read: Omit<AuditSpec, 'permission' | 'before'>; level?: ScopeLevel };

/** Declares one admin route; its module's level applies unless the guard names another. */
export type AdminRoute = <Path extends string>(
  method: 'get' | 'post' | 'put' | 'patch',
  path: Path,
  guard: AdminRouteGuard,
  ...handlers: RequestHandler<RouteParameters<Path>>[]
) => void;

/**
 * How every `/admin/*` route is declared (spec 001, reused by spec 002's team routes): the
 * permission it needs and, for a write, how it is audited. The path's own params type the
 * handlers, as `router.get(path, handler)` would.
 */
/** The same routes at another level (a module whose routes are mostly of one level, spec 031). */
export const atLevel =
  (route: AdminRoute, level: ScopeLevel): AdminRoute =>
  (method, path, guard, ...handlers) =>
    route(method, path, typeof guard === 'string' ? { permission: guard, level } : { ...guard, level: guard.level ?? level }, ...handlers);

export function createAdminRouting(router: Router, admin: Pick<AdminWebDependencies, 'auditLog' | 'newId' | 'now' | 'scope'>) {
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

  /** A route of a module working at `level` (spec 031, contract B1); without scope deps, none is read. */
  const at =
    (level: ScopeLevel): AdminRoute =>
    (method, path, guard, ...handlers) => {
      const permission = typeof guard === 'string' ? guard : guard.permission;
      const audit =
        typeof guard === 'string'
          ? []
          : 'audit' in guard
            ? [trail.audited({ ...guard.audit, permission })]
            : 'read' in guard
              ? [trail.auditedRead({ ...guard.read, permission })]
              : [];
      const routeLevel = typeof guard === 'string' ? level : (guard.level ?? level);
      const scope = admin.scope ? [requireScope(routeLevel, admin.scope, { onDenied: trail.onScopeDenied })] : [];
      router[method](path, requirePermission(permission, { onDenied: trail.onDenied }), ...scope, ...audit, ...(handlers as RequestHandler[]));
    };

  return { route: at('platform'), at, trail };
}

/** The state before a write, through an existing read; null when there is none yet. */
export async function settingsBefore(result: Promise<{ outcome: string; settings?: unknown }>): Promise<unknown> {
  const read = await result;
  return read.outcome === 'success' ? read.settings : null;
}
