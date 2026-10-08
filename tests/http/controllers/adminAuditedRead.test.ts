import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { auditTrail } from '../../../src/infrastructure/audit/audited.js';
import { FakeAdminAuditLog } from '../../fakes/fakeAdminAuditLog.js';

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
