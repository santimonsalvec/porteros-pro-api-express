import { describe, expect, it } from 'vitest';
import { GetSystemHealthQuery } from '../../../../../src/application/features/system/queries/getSystemHealth/getSystemHealthQuery.js';
import { GetSystemHealthQueryHandler } from '../../../../../src/application/features/system/queries/getSystemHealth/getSystemHealthQueryHandler.js';

const NOW = new Date('2026-10-13T14:02:00.000Z');

describe('GetSystemHealthQueryHandler (admin spec 008, research §10)', () => {
  it('answers the public health report with when it was checked, also when unhealthy', async () => {
    for (const status of ['Healthy', 'Unhealthy'] as const) {
      const handler = new GetSystemHealthQueryHandler({ checkHealth: async () => ({ status, checks: [{ name: 'mongodb', status }] }), clock: { now: () => NOW } });
      expect(await handler.handle(new GetSystemHealthQuery())).toEqual({ status, checks: [{ name: 'mongodb', status }], checkedAt: NOW });
    }
  });
});
