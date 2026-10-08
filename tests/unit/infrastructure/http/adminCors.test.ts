import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { adminCors } from '../../../../src/infrastructure/http/adminCors.js';

function call(options: { allowedOrigins: string[]; credentials?: boolean }, method: string, origin: string | undefined) {
  const headers = new Map<string, string>();
  const res = {
    setHeader: vi.fn((name: string, value: string) => headers.set(name, value)),
    append: vi.fn((name: string, value: string) => headers.set(name, value)),
    status: vi.fn(() => res),
    end: vi.fn(),
  };
  const req = { method, header: (name: string) => (name.toLowerCase() === 'origin' ? origin : undefined) } as unknown as Request;
  const next = vi.fn() as unknown as NextFunction;
  adminCors(options)(req, res as unknown as Response, next);
  return { headers, res, next };
}

const ALLOWED = ['http://localhost:4200', 'https://admin-dev.porteros.pro'];

describe('adminCors', () => {
  it('echoes an allowed origin and varies on it', () => {
    const { headers, next } = call({ allowedOrigins: ALLOWED }, 'GET', 'http://localhost:4200');

    expect(headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4200');
    expect(headers.get('Vary')).toBe('Origin');
    expect(headers.has('Access-Control-Allow-Credentials')).toBe(false);
    expect(next).toHaveBeenCalled();
  });

  it('adds no CORS header for another origin, nor without an origin', () => {
    expect(call({ allowedOrigins: ALLOWED }, 'GET', 'https://evil.example').headers.has('Access-Control-Allow-Origin')).toBe(false);
    expect(call({ allowedOrigins: ALLOWED }, 'GET', undefined).headers.has('Access-Control-Allow-Origin')).toBe(false);
  });

  it('answers an allowed preflight with 204 and the minimal methods and headers', () => {
    const { headers, res, next } = call({ allowedOrigins: ALLOWED }, 'OPTIONS', 'https://admin-dev.porteros.pro');

    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PUT, PATCH, DELETE');
    expect(headers.get('Access-Control-Allow-Headers')).toBe('Authorization, Content-Type, X-Requested-With');
    expect(headers.get('Access-Control-Max-Age')).toBe('600');
  });

  it('a preflight from another origin goes on without CORS headers (the browser then blocks it)', () => {
    const { headers, next } = call({ allowedOrigins: ALLOWED }, 'OPTIONS', 'https://evil.example');

    expect(headers.has('Access-Control-Allow-Origin')).toBe(false);
    expect(next).toHaveBeenCalled();
  });

  it('allows credentials only when asked to', () => {
    expect(call({ allowedOrigins: ALLOWED, credentials: true }, 'POST', 'http://localhost:4200').headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('never allows anything with an empty list', () => {
    expect(call({ allowedOrigins: [] }, 'GET', 'http://localhost:4200').headers.has('Access-Control-Allow-Origin')).toBe(false);
  });
});
