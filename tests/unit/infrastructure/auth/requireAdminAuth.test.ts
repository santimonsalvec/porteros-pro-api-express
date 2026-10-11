import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { requireAdminAuth } from '../../../../src/infrastructure/auth/middleware/requireAdminAuth.js';
import type { IStaffAccessResolver, ResolvedStaffAccess } from '../../../../src/application/features/staff/common/ports.js';
import { FakeAdminTokenIssuer } from '../../../fakes/fakeAdminTokenIssuer.js';

function run(authorization: string | undefined, resolved: ResolvedStaffAccess | null, issuer = new FakeAdminTokenIssuer()) {
  const resolver: IStaffAccessResolver = { resolve: vi.fn(async () => resolved), invalidate: vi.fn() };
  const req = { header: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined) } as unknown as Request;
  const res = { status: vi.fn(() => res), end: vi.fn() };
  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next, resolver, middleware: requireAdminAuth((token) => issuer.verifyAccessToken(token), resolver) };
}

const access = {
  session: { staffId: 'staff-1' },
  member: { id: 'staff-1', email: 'ana@example.com' },
  role: { id: 'soporte' },
  permissions: ['cases.read'],
  isOwner: false,
} as unknown as ResolvedStaffAccess;

describe('requireAdminAuth', () => {
  it('answers 401 with no body without a bearer token', async () => {
    const { req, res, next, middleware } = run(undefined, access);

    await middleware(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("answers 401 to a token it did not issue (an app token)", async () => {
    const { req, res, next, middleware } = run('Bearer access-1', access);

    await middleware(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('answers 401 when the session no longer resolves, or belongs to another member', async () => {
    const issuer = new FakeAdminTokenIssuer();
    issuer.registerAccessToken('t', { userId: 'user-1', sessionId: 'sid-1', staffId: 'staff-1' });
    issuer.registerAccessToken('other', { userId: 'user-1', sessionId: 'sid-1', staffId: 'staff-2' });

    for (const [token, resolved] of [['t', null], ['other', access]] as const) {
      const { req, res, next, middleware } = run(`Bearer ${token}`, resolved, issuer);
      await middleware(req, res as unknown as Response, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('attaches the access and goes on with a valid token', async () => {
    const issuer = new FakeAdminTokenIssuer();
    issuer.registerAccessToken('t', { userId: 'user-1', sessionId: 'sid-1', staffId: 'staff-1' });
    const { req, res, next, middleware, resolver } = run('Bearer t', access, issuer);

    await middleware(req, res as unknown as Response, next);

    expect(resolver.resolve).toHaveBeenCalledWith('sid-1');
    expect(next).toHaveBeenCalled();
    expect(req.adminAccess).toEqual({
      userId: 'user-1',
      staffId: 'staff-1',
      sessionId: 'sid-1',
      email: 'ana@example.com',
      roleId: 'soporte',
      permissions: ['cases.read'],
      isOwner: false,
    });
  });
});
