import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { as, geographyStaff } from '../geographyTestHelpers.js';
import { seedRole, signInStaff } from '../adminTestHelpers.js';
import { signInClient } from '../operatingBalanceTestHelpers.js';
import { POINTS, QUOTE_FORMAT_FIELDS } from '../../fixtures/quoteFixtures.js';

async function catalogEditor(context: Awaited<ReturnType<typeof buildTestApp>>) {
  await seedRole(context, 'catalogos', ['geography.read', 'catalogs.manage']);
  return as(context, (await signInStaff(context, { key: 'catalogos', roleId: 'catalogos' })).token);
}

describe('/admin/document-types and /admin/match-surfaces (admin spec 003, US5)', () => {
  it('creates, edits and deletes a document type, warning about one invoicing rejects', async () => {
    const context = await buildTestApp();
    await geographyStaff(context);
    const api = await catalogEditor(context);

    const held = await api.post('/admin/document-types', { code: 'tarjeta_identidad', name: 'Tarjeta de identidad' });
    const created = await api.post('/admin/document-types', { code: 'tarjeta_identidad', name: 'Tarjeta de identidad', acknowledgeWarnings: true });
    const id = created.body.id as string;
    const renamed = await api.patch(`/admin/document-types/${id}`, { revision: 0, name: 'Tarjeta de identidad (TI)' });
    const app = await request(context.app).get('/goalkeepers/document-types');
    const deleted = await api.post(`/admin/document-types/${id}/delete`, { reason: 'No se usa' });

    expect([held.status, held.body.error, held.body.warnings[0].code]).toEqual([409, 'warnings_unacknowledged', 'document_type_not_invoiceable']);
    expect([created.status, created.body.invoiceable, created.body.inUse]).toEqual([201, false, false]);
    expect([renamed.status, renamed.body.name]).toEqual([200, 'Tarjeta de identidad (TI)']);
    expect(app.body.documentTypes.map((t: { code: string }) => t.code)).toContain('tarjeta_identidad');
    expect(deleted.status).toBe(204);
    expect(context.adminAuditLog.entries.filter((e) => e.outcome === 'done').map((e) => e.action)).toEqual([
      'documentType.create',
      'documentType.update',
      'documentType.delete',
    ]);
  });

  it('answers the document type conflicts', async () => {
    const context = await buildTestApp();
    await geographyStaff(context);
    const api = await catalogEditor(context);
    context.referenceUsage.use('cedula_ciudadania', 'document_type_in_use');

    const taken = await api.post('/admin/document-types', { code: 'pasaporte', name: 'Otro pasaporte' });
    const renameInUse = await api.patch('/admin/document-types/dt1', { revision: 0, code: 'CC' });
    const deleteInUse = await api.post('/admin/document-types/dt1/delete', { reason: 'Limpieza' });

    expect([taken.status, taken.body.error]).toEqual([409, 'document_type_code_taken']);
    expect([renameInUse.status, renameInUse.body.error]).toEqual([409, 'document_type_code_in_use']);
    expect([deleteInUse.status, deleteInUse.body.error]).toEqual([409, 'document_type_in_use']);
  });

  it('deactivates a surface with a reason: new quotes no longer offer it', async () => {
    const context = await buildTestApp();
    await geographyStaff(context);
    const api = await catalogEditor(context);
    const client = await signInClient(context, 'sub-0501');
    const config = () =>
      request(context.app)
        .get(`/goalkeeper-requests/config?latitude=${POINTS.caliNorte.latitude}&longitude=${POINTS.caliNorte.longitude}`)
        .set('Authorization', `Bearer ${client.token}`);

    const listed = await api.get('/admin/match-surfaces');
    const noReason = await api.patch('/admin/match-surfaces/synthetic_grass', { revision: 0, active: false });
    const off = await api.patch('/admin/match-surfaces/synthetic_grass', { revision: 0, active: false, reason: 'Ya no se ofrece' });
    const created = await api.post('/admin/match-surfaces', { name: 'Arena fina', active: true, order: 9 });
    const offered = await config();
    const quote = await request(context.app)
      .post('/goalkeeper-requests/quote')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ ...POINTS.caliNorte, startsAt: '2026-09-21T15:00:00', goalkeeperCount: 1, durationMinutes: 60, ...QUOTE_FORMAT_FIELDS });

    expect(listed.body.items[0]).toMatchObject({ id: 'synthetic_grass', active: true, order: 1, inUse: false });
    expect([noReason.status, Object.keys(noReason.body.fieldErrors)]).toEqual([400, ['reason']]);
    expect([off.status, off.body.active]).toEqual([200, false]);
    expect(created.status).toBe(201);
    expect(offered.body.surfaces.map((s: { name: string }) => s.name)).not.toContain('Grama sintética');
    expect(offered.body.surfaces.map((s: { name: string }) => s.name)).toContain('Arena fina');
    expect([quote.status, Object.keys(quote.body.fieldErrors ?? {})]).toEqual([400, ['surfaceId']]);
    expect(context.adminAuditLog.entries.find((e) => e.action === 'matchSurface.update' && e.outcome === 'done')!.request).toMatchObject({
      reason: 'Ya no se ofrece',
    });
  });

  it('a surface in use cannot be deleted', async () => {
    const context = await buildTestApp();
    await geographyStaff(context);
    const api = await catalogEditor(context);
    context.referenceUsage.use('synthetic_grass', 'surface_in_use');

    const response = await api.post('/admin/match-surfaces/synthetic_grass/delete', { reason: 'Limpieza' });

    expect([response.status, response.body.error]).toEqual([409, 'surface_in_use']);
  });

  it('reads with geography.read, writes only with catalogs.manage', async () => {
    const context = await buildTestApp();
    const { reader, editor } = await geographyStaff(context);

    expect((await reader.get('/admin/document-types')).status).toBe(200);
    expect((await reader.get('/admin/match-surfaces')).status).toBe(200);
    expect((await editor.post('/admin/document-types', { code: 'nit', name: 'NIT' })).status).toBe(403);
    expect((await editor.patch('/admin/match-surfaces/wood', { revision: 0, name: 'Madera' })).status).toBe(403);
  });
});
