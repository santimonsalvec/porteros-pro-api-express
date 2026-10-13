import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { auditTrail } from '../../../src/infrastructure/audit/audited.js';
import { FakeAdminAuditLog } from '../../fakes/fakeAdminAuditLog.js';
import { createAdminRouting } from '../../../src/controllers/admin/adminRoute.js';
import type { Permission } from '../../../src/domain/staff/permissionCatalog.js';

describe('a sensitive read is audited (spec 001, FR-023a)', () => {
  it('records who looked at what, never the data shown', async () => {
    const log = new FakeAdminAuditLog();
    const trail = auditTrail({ auditLog: log, newId: () => 'a-1', now: () => new Date('2026-10-08T14:00:00.000Z'), logError: () => undefined });
    const app = express();
    app.get(
      '/admin/__test/sensitive/:id',
      (req, _res, next) => {
        req.adminAccess = { staffId: 'staff-1', userId: 'user-1', email: 'ana@porteros.pro', sessionId: 'sid-1', roleId: 'owner', permissions: [], isOwner: true };
        next();
      },
      trail.auditedRead({ permission: 'goalkeepers.read', action: 'goalkeeperDocument.view', resourceType: 'goalkeeper', resourceId: (req) => String(req.params.id) }),
      (_req, res) => {
        res.status(200).json({ documentNumber: '1020304050' });
      },
    );

    const response = await request(app).get('/admin/__test/sensitive/g-1');

    expect(response.body).toEqual({ documentNumber: '1020304050' });
    expect(log.entries).toEqual([expect.objectContaining({ kind: 'read', action: 'goalkeeperDocument.view', resourceId: 'g-1', outcome: 'done' })]);
    expect(JSON.stringify(log.entries)).not.toContain('1020304050');
  });
});

describe('route() declares a sensitive read (admin spec 005, research §7)', () => {
  const member = (permissions: Permission[]) => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.adminAccess = { staffId: 'staff-1', userId: 'user-1', email: 'ana@porteros.pro', sessionId: 'sid-1', roleId: 'soporte', permissions, isOwner: false };
    next();
  };

  const appWith = (permissions: Permission[], status = 200) => {
    const log = new FakeAdminAuditLog();
    const router = express.Router();
    router.use(member(permissions));
    const { route } = createAdminRouting(router, { auditLog: log, newId: () => 'a-1', now: () => new Date('2026-10-12T14:00:00.000Z') });
    route('get', '/users/:userId/phone', { permission: 'users.read', read: { action: 'user.phone.read', resourceType: 'user', resourceId: (req) => String(req.params.userId) } }, (_req, res) => {
      res.status(status).json(status === 200 ? { whatsAppNumber: '3001234567' } : { error: 'user_not_found', message: 'x' });
    });
    const app = express();
    app.use('/admin', router);
    return { app, log };
  };

  it('records a read with who looked, and never the data or the request', async () => {
    const { app, log } = appWith(['users.read']);

    const response = await request(app).get('/admin/users/u-1/phone');

    expect(response.body).toEqual({ whatsAppNumber: '3001234567' });
    expect(log.entries).toEqual([
      expect.objectContaining({
        kind: 'read', permission: 'users.read', action: 'user.phone.read', resourceType: 'user', resourceId: 'u-1',
        outcome: 'done', before: null, after: null, request: null,
      }),
    ]);
    expect(JSON.stringify(log.entries)).not.toContain('3001234567');
  });

  it('a refused read leaves only the denial', async () => {
    const { app, log } = appWith(['goalkeepers.read']);

    expect((await request(app).get('/admin/users/u-1/phone')).status).toBe(403);
    expect(log.entries).toEqual([expect.objectContaining({ outcome: 'denied', permission: 'users.read' })]);
  });

  it('a read that finds nothing is recorded as rejected', async () => {
    const { app, log } = appWith(['users.read'], 404);

    await request(app).get('/admin/users/u-1/phone');

    expect(log.entries).toEqual([expect.objectContaining({ kind: 'read', outcome: 'rejected', httpStatus: 404, errorCode: 'user_not_found' })]);
  });
});
