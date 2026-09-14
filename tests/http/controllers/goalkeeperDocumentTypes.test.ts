import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';

describe('GET /api/goalkeepers/document-types', () => {
  it('returns the seeded document types with no authentication required', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get('/api/goalkeepers/document-types');

    expect(response.status).toBe(200);
    expect(response.body.documentTypes).toContainEqual({ code: 'cedula_ciudadania', name: 'Cédula de ciudadanía' });
    expect(response.body.documentTypes).toHaveLength(3);
  });
});
