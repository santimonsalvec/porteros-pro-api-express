import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';

describe('GET /api/locations/countries', () => {
  it('returns the full country catalog with no authentication', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get('/api/locations/countries');

    expect(response.status).toBe(200);
    expect(response.body.countries).toEqual([{ countryCode: 'CO', name: 'Colombia', dialCode: '+57' }]);
  });
});
