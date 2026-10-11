import { describe, expect, it } from 'vitest';
import { scriptAuditEntry } from '../../../../src/infrastructure/audit/scriptAudit.js';

describe('scriptAuditEntry', () => {
  it('records an operations script as the actor, without session, IP nor browser', () => {
    const at = new Date('2026-10-08T14:00:00.000Z');

    const entry = scriptAuditEntry({
      id: 'a-1',
      at,
      script: 'seed-owner',
      permission: 'staff.manage',
      action: 'staff.seedOwner',
      resourceType: 'staffMember',
      resourceId: 'staff-1',
      outcome: 'created',
      request: { emailDomain: 'porteros.pro' },
    });

    expect(entry).toEqual({
      id: 'a-1',
      at,
      kind: 'write',
      actor: { system: 'script', name: 'seed-owner' },
      sessionId: null,
      permission: 'staff.manage',
      action: 'staff.seedOwner',
      resourceType: 'staffMember',
      resourceId: 'staff-1',
      outcome: 'done',
      httpStatus: null,
      errorCode: null,
      before: null,
      after: { outcome: 'created' },
      request: { emailDomain: 'porteros.pro' },
      ip: null,
      userAgent: null,
    });
  });

  it('marks a refusal as rejected with its reason', () => {
    const entry = scriptAuditEntry({
      id: 'a-2',
      at: new Date(),
      script: 'staff',
      permission: 'staff.manage',
      action: 'staff.disable',
      resourceType: 'staffMember',
      resourceId: 'owner-1',
      outcome: 'last_owner',
      rejected: true,
    });

    expect(entry).toMatchObject({ outcome: 'rejected', errorCode: 'last_owner', after: null });
  });
});
