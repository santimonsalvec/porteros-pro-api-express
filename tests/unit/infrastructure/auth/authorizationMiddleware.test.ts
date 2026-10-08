import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { requireCompleteProfile } from '../../../../src/infrastructure/auth/middleware/requireCompleteProfile.js';
import type { AccessTokenClaims } from '../../../../src/application/features/auth/common/accessTokenClaims.js';

function makeReqRes(claims?: AccessTokenClaims) {
  const req = { authClaims: claims } as unknown as Request;
  const status = vi.fn().mockReturnThis();
  const end = vi.fn();
  const res = { status, end } as unknown as Response;
  const next = vi.fn();
  return { req, res, next, status, end };
}

describe('requireCompleteProfile', () => {
  it('calls next when the profile is complete', () => {
    const { req, res, next } = makeReqRes({ sub: 'u1', email: 'a@b.com', isAdmin: 'false', profileComplete: 'true' });
    requireCompleteProfile()(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 403 when the profile is incomplete', () => {
    const { req, res, next, status } = makeReqRes({ sub: 'u1', email: 'a@b.com', isAdmin: 'false', profileComplete: 'false' });
    requireCompleteProfile()(req, res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
