import type { Request, Response } from 'express';

/**
 * The admin web's refresh value travels only in this cookie (research §3): out of reach of the
 * page's scripts, sent only to `/auth/admin` and only from the same site. No `Max-Age`: it goes
 * when the browser closes, and the server decides its real validity (12 h, 30 min idle).
 */
export const ADMIN_REFRESH_COOKIE = 'pp_admin_rt';
const COOKIE_PATH = '/auth/admin';

export interface CookieOptions {
  /** False only for local development over plain HTTP. */
  secure: boolean;
}

export function readRefreshCookie(req: Request): string | null {
  const header = req.header('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1 || part.slice(0, separator).trim() !== ADMIN_REFRESH_COOKIE) continue;
    const raw = part.slice(separator + 1).trim();
    if (raw === '') return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return null;
    }
  }
  return null;
}

export function setRefreshCookie(res: Response, value: string, options: CookieOptions): void {
  res.append('Set-Cookie', cookie(encodeURIComponent(value), options));
}

export function clearRefreshCookie(res: Response, options: CookieOptions): void {
  res.append('Set-Cookie', `${cookie('', options)}; Max-Age=0`);
}

function cookie(value: string, options: CookieOptions): string {
  const attributes = [`${ADMIN_REFRESH_COOKIE}=${value}`, `Path=${COOKIE_PATH}`, 'HttpOnly', 'SameSite=Strict'];
  if (options.secure) attributes.push('Secure');
  return attributes.join('; ');
}
