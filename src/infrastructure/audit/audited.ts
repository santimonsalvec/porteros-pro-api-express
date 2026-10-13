import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { IAdminAuditLog } from '../../application/features/staff/common/ports.js';
import type { AuditActor, AuditEntry, AuditKind, AuditOutcome } from '../../domain/staff/auditEntry.js';
import type { Permission } from '../../domain/staff/permissionCatalog.js';
import { redactForAudit } from './auditRedaction.js';

const USER_AGENT_MAX = 300;

export interface AuditTrailDependencies {
  auditLog: IAdminAuditLog;
  newId: () => string;
  now: () => Date;
  /** Where an entry goes when the log cannot take it (twice): the error log, already redacted. */
  logError: (entry: AuditEntry) => void;
}

export interface AuditSpec {
  permission: Permission;
  /** `resource.verb`, e.g. `taxSettings.update`. */
  action: string;
  resourceType: string;
  resourceId: (req: Request) => string;
  /** The state before the write, read through the mediator; failures leave it null. */
  before?: (req: Request) => Promise<unknown>;
}

/**
 * The audit of the admin web (research §5), as route middleware so the existing handlers stay as
 * they are. The entry is written when the route answers — after a JSON body is ready and before it
 * leaves — so a client that saw the answer can find its entry. A handler marks an idempotent repeat
 * with `res.locals.auditOutcome = 'replayed'`, and may set `res.locals.auditAction` (the action it
 * took) and `res.locals.auditResourceId` (an id it created).
 */
export function auditTrail(deps: AuditTrailDependencies) {
  const write = async (entry: AuditEntry): Promise<void> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await deps.auditLog.append(entry);
        return;
      } catch {
        // Retried once; then the entry goes to the error log below.
      }
    }
    deps.logError(entry);
  };

  const entryFor = (req: Request, fields: Pick<AuditEntry, 'kind' | 'permission' | 'action' | 'resourceType' | 'resourceId'>, rest: Partial<AuditEntry>): AuditEntry => ({
    id: deps.newId(),
    at: deps.now(),
    ...fields,
    actor: actorOf(req),
    sessionId: req.adminAccess?.sessionId ?? null,
    outcome: 'done',
    httpStatus: null,
    errorCode: null,
    before: null,
    after: null,
    request: null,
    ip: req.ip ?? null,
    userAgent: req.header('user-agent')?.slice(0, USER_AGENT_MAX) ?? null,
    ...rest,
  });

  const middleware = (spec: AuditSpec, kind: AuditKind): RequestHandler =>
    async (req: Request, res: Response, next: NextFunction) => {
      // Read now: by the time the app-level error handler answers, Express has reset `req.params`.
      const resourceId = spec.resourceId(req);
      const before = kind === 'write' && spec.before ? redactForAudit(spec.resourceType, await spec.before(req).catch(() => null)) : null;
      // A handler may name what to keep as the request instead of the body (an export's filters).
      const requestOf = (): AuditEntry['request'] => {
        const own = res.locals.auditRequest as unknown;
        if (own !== undefined) return redactForAudit(spec.resourceType, own);
        return kind === 'write' ? redactForAudit(spec.resourceType, req.body) : null;
      };
      const entryOf = (body: unknown, isJson: boolean): AuditEntry => {
        const status = res.statusCode;
        const succeeded = status >= 200 && status < 300;
        return entryFor(
          req,
          {
            kind,
            permission: spec.permission,
            // A handler may name the action it took (zone.deactivate…) or the id it created.
            action: (res.locals.auditAction as string | undefined) ?? spec.action,
            resourceType: spec.resourceType,
            resourceId: (res.locals.auditResourceId as string | undefined) ?? resourceId,
          },
          {
            outcome: succeeded ? ((res.locals.auditOutcome as AuditOutcome | undefined) ?? 'done') : 'rejected',
            httpStatus: status,
            errorCode: succeeded || !isJson ? null : errorCodeOf(body),
            before,
            // A file or a CSV is never kept: only a JSON body can be an `after`.
            after: kind === 'write' && succeeded && isJson ? redactForAudit(spec.resourceType, body) : null,
            request: requestOf(),
          },
        );
      };
      // Express's `res.json` ends in `res.send`, so one answer is recorded once (admin spec 007).
      let recorded = false;
      const json = res.json.bind(res);
      res.json = (body: unknown) => {
        if (recorded) return json(body);
        recorded = true;
        void write(entryOf(body, true)).finally(() => json(body));
        return res;
      };
      if (typeof res.send === 'function') {
        const send = res.send.bind(res);
        res.send = (body?: unknown) => {
          if (recorded) return send(body);
          recorded = true;
          void write(entryOf(body, false)).finally(() => send(body));
          return res;
        };
      }
      next();
    };

  return {
    audited: (spec: AuditSpec): RequestHandler => middleware(spec, 'write'),
    /** A read that shows sensitive personal data (FR-023a): who looked, never what they saw. */
    auditedRead: (spec: Omit<AuditSpec, 'before'>): RequestHandler => middleware(spec, 'read'),
    /** For `requirePermission`: every refusal is recorded as `denied`. */
    onDenied: (req: Request, permission: Permission): void => {
      const path = (req.originalUrl ?? req.url ?? '').split('?')[0] ?? '';
      void write(
        entryFor(
          req,
          { kind: req.method === 'GET' ? 'read' : 'write', permission, action: req.method, resourceType: 'admin_route', resourceId: path },
          { outcome: 'denied', httpStatus: 403, errorCode: 'permission_denied' },
        ),
      );
    },
  };
}

function actorOf(req: Request): AuditActor {
  const access = req.adminAccess;
  return access ? { staffId: access.staffId, userId: access.userId, email: access.email } : { system: 'script', name: 'unknown' };
}

function errorCodeOf(body: unknown): string | null {
  return typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
    ? (body as { error: string }).error
    : null;
}
