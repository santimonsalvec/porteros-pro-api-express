import { describe, expect, it, vi } from 'vitest';
import type { Db } from 'mongodb';
import { MongoHealthCheck } from '../../../../src/infrastructure/healthChecks/mongoHealthCheck.js';

describe('MongoHealthCheck (mocked driver)', () => {
  it('reports Healthy when the ping command resolves', async () => {
    const db = { command: vi.fn().mockResolvedValue({ ok: 1 }) } as unknown as Db;
    const check = new MongoHealthCheck(db);

    const report = await check.check();

    expect(report).toEqual({ status: 'Healthy', checks: [{ name: 'mongodb', status: 'Healthy' }] });
  });

  it('reports Unhealthy, with no internal detail, when the ping command rejects', async () => {
    const db = { command: vi.fn().mockRejectedValue(new Error('mongodb://user:pass@host/ connection refused')) } as unknown as Db;
    const check = new MongoHealthCheck(db);

    const report = await check.check();

    expect(report).toEqual({ status: 'Unhealthy', checks: [{ name: 'mongodb', status: 'Unhealthy' }] });
    expect(JSON.stringify(report)).not.toMatch(/mongodb:\/\/|connection refused/);
  });

  it('reports Unhealthy when the ping never resolves within the timeout', async () => {
    vi.useFakeTimers();
    try {
      const db = { command: vi.fn().mockReturnValue(new Promise(() => {})) } as unknown as Db;
      const check = new MongoHealthCheck(db);

      const reportPromise = check.check();
      await vi.advanceTimersByTimeAsync(3_100);
      const report = await reportPromise;

      expect(report.status).toBe('Unhealthy');
    } finally {
      vi.useRealTimers();
    }
  });
});
