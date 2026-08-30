import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';

describe('GET /health', () => {
  it('reports healthy while the dependency is up', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'Healthy', checks: [{ name: 'mongodb', status: 'Healthy' }] });
  });

  it('reports unhealthy with a 503 and no internal detail', async () => {
    const { app, health } = buildTestApp();
    health.status = 'Unhealthy';
    health.checks = [{ name: 'mongodb', status: 'Unhealthy' }];

    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toMatch(/Error|stack|mongodb:\/\//i);
  });
});
