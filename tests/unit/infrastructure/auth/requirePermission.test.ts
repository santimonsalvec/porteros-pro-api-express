import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { requirePermission } from '../../../../src/infrastructure/auth/middleware/requirePermission.js';
import type { AdminAccess } from '../../../../src/infrastructure/auth/middleware/requireAdminAuth.js';
import type { Permission } from '../../../../src/domain/staff/permissionCatalog.js';

function run(permission: string, access: Partial<AdminAccess> | undefined) {
  const onDenied = vi.fn();
  const req = { adminAccess: access } as unknown as Request;
  const res = { status: vi.fn(() => res), json: vi.fn(), end: vi.fn() };
  const next = vi.fn() as unknown as NextFunction;
  requirePermission(permission as Permission, { onDenied })(req, res as unknown as Response, next);
  return { req, res, next, onDenied };
}

const member = (permissions: Permission[], isOwner = false): Partial<AdminAccess> => ({ staffId: 'staff-1', permissions, isOwner });

describe('requirePermission', () => {
  it('lets a role with the permission through', () => {
    const { next, res } = run('cases.read', member(['cases.read']));

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('lets the owner through with any permission, even one added to the catalog later', () => {
    expect(run('cases.resolve', member([], true)).next).toHaveBeenCalled();
    expect(run('future.permission', member([], true)).next).toHaveBeenCalled();
  });

  it('answers 403 permission_denied, naming the permission, and reports the denial', () => {
    const { next, res, onDenied, req } = run('cases.resolve', member(['cases.read']));

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'permission_denied',
      message: 'Your role does not allow this action.',
      permission: 'cases.resolve',
    });
    expect(onDenied).toHaveBeenCalledWith(req, 'cases.resolve');
  });

  it('answers 401 when no admin session was resolved before it', () => {
    const { res, next } = run('cases.read', undefined);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
