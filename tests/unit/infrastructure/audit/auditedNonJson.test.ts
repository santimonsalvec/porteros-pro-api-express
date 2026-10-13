import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { auditTrail } from '../../../../src/infrastructure/audit/audited.js';
import { FakeAdminAuditLog } from '../../../fakes/fakeAdminAuditLog.js';

// Downloads (a PDF, a CSV) answer with `res.send`, not `res.json` (admin spec 007, research §6–§7).

const NOW = new Date('2026-10-13T14:00:00.000Z');

function fakeRequest() {
  return {
    adminAccess: { staffId: 'staff-1', userId: 'user-1', email: 'ana@porteros.pro', sessionId: 'sid-1', roleId: 'owner', permissions: [], isOwner: true },
    params: { documentId: 'doc-1' },
    query: {},
    body: {},
    ip: '1.2.3.4',
    method: 'GET',
    header: () => undefined,
  } as unknown as Request;
}

/** Like Express: `json` serializes and calls `this.send`, so both wrappers see one answer. */
function fakeResponse() {
  const res = Object.assign(new EventEmitter(), { statusCode: 200, locals: {} as Record<string, unknown>, sent: [] as unknown[] });
  const send = vi.fn(function (this: typeof res, body: unknown) {
    res.sent.push(body);
    return res;
  });
  const json = vi.fn(function (this: { send: (body: unknown) => unknown }, body: unknown) {
    return this.send(JSON.stringify(body));
  });
  return Object.assign(res, { send, json, status: (code: number) => ((res.statusCode = code), res) }) as unknown as Response & { sent: unknown[] };
}

async function run(middleware: ReturnType<ReturnType<typeof auditTrail>['auditedRead']>, res: Response, respond: (res: Response) => void) {
  const next = vi.fn() as unknown as NextFunction;
  await middleware(fakeRequest(), res, next);
  respond(res);
  await vi.waitFor(() => expect((res as unknown as { sent: unknown[] }).sent.length).toBeGreaterThan(0));
}

describe('auditTrail with answers that are not JSON', () => {
  const setup = () => {
    const log = new FakeAdminAuditLog();
    const trail = auditTrail({ auditLog: log, newId: () => 'a-1', now: () => NOW, logError: () => undefined });
    return { log, trail };
  };
  const readSpec = {
    permission: 'invoicing.read' as const,
    action: 'invoicingDocument.pdf.read',
    resourceType: 'invoicingDocument',
    resourceId: (req: Request) => String(req.params.documentId),
  };

  it('records one read for a file sent with res.send, without the file', async () => {
    const { log, trail } = setup();
    const res = fakeResponse();
    const file = Buffer.from('%PDF-1.7 secret buyer data');

    await run(trail.auditedRead(readSpec), res, (r) => r.status(200).send(file));

    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]).toMatchObject({ kind: 'read', action: 'invoicingDocument.pdf.read', resourceId: 'doc-1', outcome: 'done', httpStatus: 200, request: null, after: null });
    expect(JSON.stringify(log.entries[0])).not.toContain('secret buyer data');
    expect(res.sent).toEqual([file]);
  });

  it('records a JSON answer once, although res.json goes through res.send', async () => {
    const { log, trail } = setup();
    const res = fakeResponse();

    await run(trail.auditedRead(readSpec), res, (r) => r.status(404).json({ error: { code: 'invoicing_document_not_found' } }));

    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]).toMatchObject({ outcome: 'rejected', httpStatus: 404 });
  });

  it('keeps res.locals.auditRequest, redacted, on a read', async () => {
    const { log, trail } = setup();
    const res = fakeResponse();
    const exportSpec = { permission: 'topups.read' as const, action: 'topUps.export', resourceType: 'topUps', resourceId: () => 'export' };

    await run(trail.auditedRead(exportSpec), res, (r) => {
      r.locals.auditRequest = { status: 'pending', countryId: 'country-co', rows: 2, email: 'ana@example.com' };
      r.status(200).send('﻿fecha;estado\r\n');
    });

    expect(log.entries[0]).toMatchObject({ kind: 'read', request: { status: 'pending', countryId: 'country-co', rows: 2 } });
    expect(JSON.stringify(log.entries[0]?.request)).not.toContain('ana@example.com');
  });

  it('keeps res.locals.auditRequest on a write instead of the body', async () => {
    const { log, trail } = setup();
    const res = fakeResponse();
    const writeSpec = { permission: 'topups.reconcile' as const, action: 'topUp.reconcile', resourceType: 'topUp', resourceId: () => 'top-1' };

    await run(trail.audited(writeSpec), res, (r) => {
      r.locals.auditRequest = { topUpId: 'top-1', answer: 'APPROVED' };
      r.status(200).json({ topUpId: 'top-1', status: 'approved' });
    });

    expect(log.entries[0]).toMatchObject({ kind: 'write', request: { topUpId: 'top-1', answer: 'APPROVED' } });
  });

  it('leaves request null on a read without auditRequest', async () => {
    const { log, trail } = setup();
    const res = fakeResponse();

    await run(trail.auditedRead(readSpec), res, (r) => r.status(200).send('x'));

    expect(log.entries[0]?.request).toBeNull();
  });
});
