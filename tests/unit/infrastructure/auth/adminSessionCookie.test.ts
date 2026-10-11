import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  ADMIN_REFRESH_COOKIE,
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from '../../../../src/infrastructure/auth/adminSessionCookie.js';

const requestWith = (cookie: string | undefined) => ({ header: (name: string) => (name.toLowerCase() === 'cookie' ? cookie : undefined) }) as unknown as Request;
const response = () => {
  const append = vi.fn();
  return { res: { append } as unknown as Response, append };
};

describe('admin refresh cookie', () => {
  it('reads pp_admin_rt among other cookies, URL-decoded', () => {
    expect(ADMIN_REFRESH_COOKIE).toBe('pp_admin_rt');
    expect(readRefreshCookie(requestWith('theme=dark; pp_admin_rt=abc%2Bdef; sidebar_state=true'))).toBe('abc+def');
    expect(readRefreshCookie(requestWith('pp_admin_rt=xyz'))).toBe('xyz');
  });

  it('is null without the cookie, with an empty one, or with a malformed value', () => {
    expect(readRefreshCookie(requestWith(undefined))).toBeNull();
    expect(readRefreshCookie(requestWith('theme=dark'))).toBeNull();
    expect(readRefreshCookie(requestWith('pp_admin_rt='))).toBeNull();
    expect(readRefreshCookie(requestWith('pp_admin_rt=%E0%A4%A'))).toBeNull();
  });

  it('writes a session cookie limited to /auth/admin, HttpOnly, Secure and SameSite=Strict', () => {
    const { res, append } = response();

    setRefreshCookie(res, 'abc+def', { secure: true });

    expect(append).toHaveBeenCalledWith('Set-Cookie', 'pp_admin_rt=abc%2Bdef; Path=/auth/admin; HttpOnly; SameSite=Strict; Secure');
  });

  it('omits Secure only when told to (local HTTP)', () => {
    const { res, append } = response();

    setRefreshCookie(res, 'abc', { secure: false });

    expect(append).toHaveBeenCalledWith('Set-Cookie', 'pp_admin_rt=abc; Path=/auth/admin; HttpOnly; SameSite=Strict');
  });

  it('clears it with Max-Age=0', () => {
    const { res, append } = response();

    clearRefreshCookie(res, { secure: true });

    expect(append).toHaveBeenCalledWith('Set-Cookie', 'pp_admin_rt=; Path=/auth/admin; HttpOnly; SameSite=Strict; Secure; Max-Age=0');
  });
});
