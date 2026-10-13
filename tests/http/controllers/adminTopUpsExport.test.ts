import { describe, expect, it } from 'vitest';
import { adminGet, memberWith, topUpWorld } from '../financeTestHelpers.js';

// Admin spec 007, US1 (FR-024, contracts/finance-api.md §3): top-ups as a CSV for accounting.

describe('admin top-up export (spec 007 of the admin, FR-024)', () => {
  it('sends the filtered top-ups as a CSV and audits the filters and the row count', async () => {
    const { context, owner, goalkeeper } = await topUpWorld();
    context.adminAuditLog.entries.length = 0;

    const response = await adminGet(context, `/admin/top-ups/export?status=pending&goalkeeperId=${goalkeeper.userId}`, owner.token);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(response.headers['content-disposition']).toMatch(/^attachment; filename="recargas-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(response.headers['cache-control']).toBe('private, no-store');
    const lines = response.text.split('\r\n');
    expect(lines[0]?.startsWith('﻿fecha_creacion;zona_horaria;referencia')).toBe(true);
    expect(lines[1]).toMatch(/;America\/Bogota;PPR-.*;Colombia;Wompi;Pruebas;Pendiente;20000;1464;18536;COP;;$/);
    expect(context.adminAuditLog.entries).toEqual([
      expect.objectContaining({ kind: 'read', action: 'topUps.export', resourceType: 'topUps', resourceId: 'export', outcome: 'done', request: { status: 'pending', goalkeeperId: goalkeeper.userId, rows: 1 } }),
    ]);
  });

  it('refuses more than 10.000 rows with the count', async () => {
    const { context, owner } = await topUpWorld();
    const many = Array.from({ length: 10_001 }, () => context.topUpRepository.all()[0]!);
    const all = context.topUpRepository.all.bind(context.topUpRepository);
    context.topUpRepository.all = () => [...all(), ...many];

    const response = await adminGet(context, '/admin/top-ups/export', owner.token);

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: 'export_too_large', count: 10_002, limit: 10_000 });
  });

  it('needs topups.read', async () => {
    const { context } = await topUpWorld();
    const member = await memberWith(context, 'facturas', ['invoicing.read']);
    expect((await adminGet(context, '/admin/top-ups/export', member.token)).status).toBe(403);
  });
});
