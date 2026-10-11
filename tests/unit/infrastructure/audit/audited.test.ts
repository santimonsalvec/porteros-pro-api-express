import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { auditTrail } from '../../../../src/infrastructure/audit/audited.js';
import { FakeAdminAuditLog } from '../../../fakes/fakeAdminAuditLog.js';

const NOW = new Date('2026-10-08T14:00:00.000Z');

function fakeRequest(body: unknown = {}) {
  return {
    adminAccess: { staffId: 'staff-1', userId: 'user-1', email: 'ana@porteros.pro', sessionId: 'sid-1', roleId: 'owner', permissions: [], isOwner: true },
    params: { countryId: 'country-co' },
    body,
    ip: '1.2.3.4',
    method: 'PUT',
    header: (name: string) => (name.toLowerCase() === 'user-agent' ? 'x'.repeat(400) : undefined),
  } as unknown as Request;
}

function fakeResponse() {
  const res = Object.assign(new EventEmitter(), { statusCode: 200, locals: {} as Record<string, unknown>, sent: [] as unknown[] });
  const json = vi.fn((body: unknown) => {
    res.sent.push(body);
    return res;
  });
  return Object.assign(res, { json, status: (code: number) => ((res.statusCode = code), res) }) as unknown as Response & { sent: unknown[] };
}

async function run(middleware: ReturnType<ReturnType<typeof auditTrail>['audited']>, req: Request, res: Response, respond: (res: Response) => void) {
  const next = vi.fn() as unknown as NextFunction;
  await middleware(req, res, next);
  respond(res);
  await vi.waitFor(() => expect((res as unknown as { sent: unknown[] }).sent.length).toBeGreaterThan(0));
}

describe('auditTrail', () => {
  const setup = () => {
    const log = new FakeAdminAuditLog();
    const errors: unknown[] = [];
    const trail = auditTrail({ auditLog: log, newId: () => 'a-1', now: () => NOW, logError: (entry) => errors.push(entry) });
    return { log, errors, trail };
  };
  const spec = {
    permission: 'pricing.manage' as const,
    action: 'taxSettings.update',
    resourceType: 'taxSettings',
    resourceId: (req: Request) => String(req.params.countryId),
    before: async () => ({ countryId: 'country-co', vatRateBps: 0 }),
  };

  it('records a successful write with before, after, the request, who and from where', async () => {
    const { log, trail } = setup();
    const res = fakeResponse();

    await run(trail.audited(spec), fakeRequest({ vatRateBps: 1900 }), res, (r) => r.status(200).json({ countryId: 'country-co', vatRateBps: 1900 }));

    expect(log.entries).toEqual([
      {
        id: 'a-1',
        at: NOW,
        kind: 'write',
        actor: { staffId: 'staff-1', userId: 'user-1', email: 'ana@porteros.pro' },
        sessionId: 'sid-1',
        permission: 'pricing.manage',
        action: 'taxSettings.update',
        resourceType: 'taxSettings',
        resourceId: 'country-co',
        outcome: 'done',
        httpStatus: 200,
        errorCode: null,
        before: { countryId: 'country-co', vatRateBps: 0 },
        after: { countryId: 'country-co', vatRateBps: 1900 },
        request: { vatRateBps: 1900 },
        ip: '1.2.3.4',
        userAgent: 'x'.repeat(300),
      },
    ]);
    expect(res.sent).toEqual([{ countryId: 'country-co', vatRateBps: 1900 }]);
  });

  it('marks a replayed write', async () => {
    const { log, trail } = setup();

    await run(trail.audited(spec), fakeRequest(), fakeResponse(), (r) => {
      r.locals.auditOutcome = 'replayed';
      r.status(200).json({ vatRateBps: 1900 });
    });

    expect(log.entries[0]!.outcome).toBe('replayed');
  });

  it('records a refused write with its error code and without an after', async () => {
    const { log, trail } = setup();

    await run(trail.audited(spec), fakeRequest(), fakeResponse(), (r) => r.status(400).json({ error: 'validation_failed', message: 'x' }));

    expect(log.entries[0]).toMatchObject({ outcome: 'rejected', httpStatus: 400, errorCode: 'validation_failed', after: null });
  });

  it('retries a failed append once, then logs the redacted entry without changing the response', async () => {
    const { log, errors, trail } = setup();
    log.failNext = 2;
    const res = fakeResponse();

    await run(trail.audited(spec), fakeRequest(), res, (r) => r.status(200).json({ vatRateBps: 1900 }));

    expect(log.entries).toEqual([]);
    expect(errors).toEqual([expect.objectContaining({ action: 'taxSettings.update', outcome: 'done' })]);
    expect(res.sent).toEqual([{ vatRateBps: 1900 }]);
  });

  it('records a sensitive read without before nor after', async () => {
    const { log, trail } = setup();

    await run(
      trail.auditedRead({ permission: 'goalkeepers.read', action: 'goalkeeperDocument.view', resourceType: 'goalkeeper', resourceId: () => 'g-1' }),
      fakeRequest(),
      fakeResponse(),
      (r) => r.status(200).json({ documentNumber: '123' }),
    );

    expect(log.entries[0]).toMatchObject({ kind: 'read', action: 'goalkeeperDocument.view', resourceId: 'g-1', before: null, after: null, request: null });
  });

  it('records a permission denial', async () => {
    const { log, trail } = setup();

    trail.onDenied(fakeRequest({ vatRateBps: 1 }), 'pricing.manage');
    await vi.waitFor(() => expect(log.entries).toHaveLength(1));

    expect(log.entries[0]).toMatchObject({ kind: 'write', outcome: 'denied', httpStatus: 403, errorCode: 'permission_denied', permission: 'pricing.manage', action: 'PUT', resourceType: 'admin_route' });
  });
});
